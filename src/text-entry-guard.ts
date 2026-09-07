/**
 * OpenStation — Text-entry guard.
 *
 * Every `<os-*>` text control keeps its real `<input>` / `<textarea>`
 * inside a shadow root. That is what keeps core's `forms.css` out of
 * it (see `components-reference.md`, "A raw input in the shell is not
 * a styling choice"), and it has a cost that only shows up on a live
 * site: by the time a keystroke typed into that input reaches a
 * listener on `document`, the browser has retargeted `event.target`
 * to the host element. A third-party script asking "is the user
 * typing?" the way most of them do —
 *
 *     if ( e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ) return;
 *
 * — sees `OS-TEXT-FIELD`, decides nobody is typing, and runs its
 * single-letter shortcut. The WordPress.com notifications panel is
 * the one that found this: its `n` toggles the panel and focuses the
 * panel's iframe, so a folder named "New" could be typed on a local
 * site and not on a wpcom one, running the same shell code.
 *
 * The guard is the structural answer, and it is deliberately narrow.
 * One capture-phase listener on `window` — the only listener position
 * that runs before anything registered on `document`, in either
 * phase — stops the propagation of a keydown that is:
 *
 *   - **printable and unmodified** (`key.length === 1`, no Ctrl, Alt
 *     or Meta). Escape, Enter, Tab, the arrows and every chord keep
 *     propagating, so `dismissable`, the switcher, the palette
 *     shortcut and a dialog's own Enter / Escape handling see exactly
 *     what they always saw. A bare printable key typed into a focused
 *     text field is text; nothing in the shell can legitimately want
 *     it as a shortcut.
 *   - **aimed at a text-entry element inside a shadow root.** The
 *     head of `composedPath()` is the real leaf whatever the
 *     retargeting says. A light-DOM input already reads as `INPUT` to
 *     every tag-name guard out there; changing what listeners see for
 *     those would widen the blast radius for nothing.
 *
 * `stopPropagation()` never cancels the default action, so the
 * character is still inserted. Two consequences worth knowing:
 *
 *   - Capture runs outward-in, so the event is stopped before it
 *     reaches the input's own listeners. A kit component therefore
 *     cannot read *characters* off `keydown` on a shadow input — it
 *     reads them off `input` / `beforeinput`, which is where every
 *     component already reads them. Non-printable keys (Enter for
 *     `os-submit`, arrows for a listbox, Backspace on an empty tag
 *     field) still arrive.
 *   - `stopPropagation()` does not stop other listeners on the same
 *     target, so a listener on `window` keeps seeing everything. That
 *     is where the presence probe counts typing as user activity.
 *
 * Bare keys arriving from a chromeless iframe are not this module's
 * concern: native keydown never crosses a frame boundary, and the
 * bridge's own forwarders apply their own text-entry gate before
 * forwarding (`docs/bridge-protocol.md`, "Keyboard forwarders").
 */

import { isTextEntryElement } from './window-manager/switcher';

let uninstall: ( () => void ) | null = null;

/**
 * Whether the guard should stop this keydown from propagating past
 * `window`: a printable, unmodified key whose real target is a
 * text-entry element inside a shadow root.
 *
 * Exported for tests and for anything else that needs to agree with
 * the guard — the predicate is the whole policy.
 */
export function isShadowTextEntryKeydown( e: KeyboardEvent ): boolean {
	if ( e.ctrlKey || e.metaKey || e.altKey ) {
		return false;
	}
	// 'Enter', 'Escape', 'ArrowDown', 'Process' (an IME composing),
	// 'Dead' (a dead key) — every named key is longer than one code
	// unit. A space is `' '` and is text.
	if ( e.key.length !== 1 ) {
		return false;
	}
	const path = e.composedPath();
	const leaf = path.length > 0 ? path[ 0 ] : null;
	if ( ! ( leaf instanceof Element ) ) {
		return false;
	}
	if ( ! ( leaf.getRootNode() instanceof ShadowRoot ) ) {
		return false;
	}
	return isTextEntryElement( leaf );
}

/**
 * Install the guard on `window`. Idempotent; returns the uninstaller
 * (a no-op after the first call for the same install).
 *
 * @param target The window to guard. Defaults to the global one;
 *               tests pass their own.
 */
export function installTextEntryGuard( target: Window = window ): () => void {
	if ( uninstall ) {
		return uninstall;
	}
	const onKeyDown = ( e: KeyboardEvent ): void => {
		if ( isShadowTextEntryKeydown( e ) ) {
			e.stopPropagation();
		}
	};
	target.addEventListener( 'keydown', onKeyDown, true );
	const off = (): void => {
		target.removeEventListener( 'keydown', onKeyDown, true );
		if ( uninstall === off ) {
			uninstall = null;
		}
	};
	uninstall = off;
	return off;
}
