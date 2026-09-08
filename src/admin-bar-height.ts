/**
 * The admin bar's real bottom edge — measured, not assumed.
 *
 * Every shell surface that hangs below the WordPress admin bar used
 * to read Core's own `--wp-admin--admin-bar--height` token: 32px,
 * 46px under 783px, and nothing else. That is Core's promise about
 * Core's bar, and the bar is the one piece of chrome the shell does
 * not own. A host can make it taller (a second row of items, a
 * Debug Bar summary that wraps), give it a top border, or push it
 * down under a fixed strip of its own — WordPress.com's staff debug
 * chrome does the last of those. The token still says 32px, the
 * shell still starts at 32px, and the bar paints over the top of
 * every window's title bar by exactly the difference.
 *
 * This module measures the bar and publishes where it actually
 * ends, as `--os-admin-bar-height` on the root element: the bar's
 * bottom edge in viewport px, which is the inset the shell needs
 * whatever moved it there. Consumers read it with Core's token as
 * the fallback — `var( --os-admin-bar-height,
 * var( --wp-admin--admin-bar--height, 32px ) )` — so the first paint
 * stays on the stylesheet's numbers and this only refines them.
 *
 * The token is present only while the bar is laid out AT the top
 * edge: a bar hidden by a mode, a mobile viewport, solo or a
 * fullscreen window has no box and publishes nothing, and a bar
 * parked off the top edge in the `dynamic` mode publishes nothing
 * either, so those modes keep resolving Core's token exactly as
 * before. The rule is geometric rather than a mode check on
 * purpose: it holds for a mode a plugin adds as well as for ours.
 */

/** The CSS custom property this module writes on `<html>`. */
export const ADMIN_BAR_HEIGHT_PROP = '--os-admin-bar-height';

/** The element measured; Core's id for the admin bar. */
export const ADMIN_BAR_ID = 'wpadminbar';

/** Wiring for {@link installAdminBarHeight}. Every field has a default. */
export interface AdminBarHeightDeps {
	/** The bar. Defaults to `#wpadminbar`; nothing is installed without one. */
	bar?: HTMLElement | null;
	/** Where the property is written. Defaults to `document.documentElement`. */
	root?: HTMLElement;
}

/** Handle returned by {@link installAdminBarHeight}. */
export interface AdminBarHeightController {
	/** Re-measure now. Idempotent: same edge, no write. */
	refresh(): void;
	/** Disconnect every observer and remove the property. */
	destroy(): void;
}

/**
 * The bar's bottom edge in viewport px, or `null` when the bar has
 * no box at the top edge — hidden, or parked above the viewport.
 *
 * `getBoundingClientRect()` rather than `offsetHeight`: the rect is
 * where the bar paints, borders included, and it carries the offset
 * a host that moved the bar gave it. A bar whose top is above the
 * viewport is the dynamic mode's parked bar (`desktop.css` moves it
 * by `inset-block-start`, never by a transform, so the rect is
 * honest about it); its peek strip is not an inset anyone wants.
 */
export function measureAdminBarBottom( bar: Element ): number | null {
	const rect = bar.getBoundingClientRect();
	if ( rect.height <= 0 || rect.top < 0 ) {
		return null;
	}
	// Two decimals: a zoomed viewport yields fractional edges, and
	// rounding to whole px would leave a hairline of backstop showing
	// above the shell or hide a hairline of the bar under it.
	return Math.round( rect.bottom * 100 ) / 100;
}

/**
 * Start measuring. Call once from the shell boot path, before the
 * work area is installed so its first measure sees the shell where
 * it will actually be.
 *
 * What triggers a re-measure:
 *
 * - the bar's box changing (an item wrapping, a host adding a row or
 *   a border, `display` toggling with a mode, the 782px breakpoint);
 * - the viewport resizing (a host strip that scales with it);
 * - the body's `class` attribute changing — the admin-bar modes and
 *   the fullscreen state are body classes, and this is what makes a
 *   pick in Preferences land before the next paint rather than on
 *   the ResizeObserver's tick;
 * - {@link AdminBarHeightController.refresh}.
 *
 * Every trigger funnels into one synchronous measure that writes the
 * property only when the edge actually moved.
 */
export function installAdminBarHeight(
	deps: AdminBarHeightDeps = {},
): AdminBarHeightController {
	const bar = deps.bar === undefined ? document.getElementById( ADMIN_BAR_ID ) : deps.bar;
	const root = deps.root ?? document.documentElement;
	const noop: AdminBarHeightController = {
		refresh: () => undefined,
		destroy: () => undefined,
	};
	if ( ! bar ) {
		return noop;
	}

	let last: number | null | undefined;
	let destroyed = false;

	const measure = (): void => {
		if ( destroyed ) {
			return;
		}
		const next = measureAdminBarBottom( bar );
		if ( next === last ) {
			return;
		}
		last = next;
		if ( next === null ) {
			root.style.removeProperty( ADMIN_BAR_HEIGHT_PROP );
		} else {
			root.style.setProperty( ADMIN_BAR_HEIGHT_PROP, `${ next }px` );
		}
	};

	let resizeObserver: ResizeObserver | null = null;
	if ( typeof ResizeObserver !== 'undefined' ) {
		resizeObserver = new ResizeObserver( measure );
		// The border box: a border a host adds is part of the edge.
		resizeObserver.observe( bar, { box: 'border-box' } );
	}

	let bodyObserver: MutationObserver | null = null;
	if ( typeof MutationObserver !== 'undefined' && document.body ) {
		bodyObserver = new MutationObserver( measure );
		bodyObserver.observe( document.body, {
			attributes: true,
			attributeFilter: [ 'class' ],
		} );
	}

	window.addEventListener( 'resize', measure );

	measure();

	return {
		refresh: measure,
		destroy: () => {
			destroyed = true;
			resizeObserver?.disconnect();
			bodyObserver?.disconnect();
			window.removeEventListener( 'resize', measure );
			root.style.removeProperty( ADMIN_BAR_HEIGHT_PROP );
		},
	};
}
