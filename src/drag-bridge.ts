/**
 * OpenStation — cross-window drag bridge.
 *
 * Native HTML5 drag-and-drop mostly works across same-origin iframes
 * (browsers preserve `text/plain`, `text/uri-list`, `text/html` in the
 * DataTransfer) — but custom MIME types like `application/x-wp-media-
 * attachment` can be stripped during the cross-frame hop, depending on
 * the browser. This bridge is the authoritative channel for the full
 * payload: source iframes postMessage us when a drag starts, the shell
 * can also push a payload in-process when a DragManager session begins
 * over a shell-rendered tile (My WordPress, desktop shortcut), and any
 * receiver iframe can read it back via `os-drag-over` /
 * `os-drop` messages routed by the shell, or pull it on
 * demand via `os-drag-payload-request`.
 *
 * Architecture:
 *
 *   Shell-rendered drag source (My WordPress tile)
 *     │  dragManager fires `os.drag.start`
 *     │  desktop.ts bridges that into `bridge.start(payload)`
 *     ▼
 *   Parent shell (this module)
 *     │  stores `currentPayload`
 *     │  dispatches `os-cross-frame-drag-start` /
 *     │  `-end` CustomEvents on document so other shell modules
 *     │  can react (highlight drop zones, dim non-target windows).
 *     │  When the pointer enters an iframe drop target, the shell
 *     │  postMessages `os-drag-over` into that iframe.
 *     │  On pointerup over an iframe, postMessages `os-drop`.
 *     ▲
 *     │  source iframe (Media Library) can ALSO drive the bridge
 *     │  via `window.parent.postMessage(os-drag-start, ...)`.
 *     ▼
 *   Receiver iframe (Gutenberg post editor)
 *     listens for `os-drop`, inserts the appropriate block.
 *
 * Payload type is a discriminated union keyed on `kind`. The receiver
 * switches on `kind` to decide what block to create.
 */

import { createSharedStore } from './shared-store';

/**
 * Attachment payload — media item dragged from a media surface
 * (My WordPress media view, future Media Library iframe).
 */
export interface AttachmentDragPayload {
	kind: 'attachment';
	id: number;
	/** Full-size file URL. */
	url: string;
	title: string;
	alt: string;
	/** `image/png`, `video/mp4`, `audio/mpeg`, application MIME, etc. */
	mime: string;
	thumbnailUrl?: string;
	sizes?: Record< string, unknown >;
}

/**
 * Post / page / CPT payload — dragged from a post-type list tile
 * (My WordPress posts/pages view).
 */
export interface PostDragPayload {
	kind: 'post';
	id: number;
	/** `'post'`, `'page'`, or any CPT slug. */
	postType: string;
	/** Permalink (frontend URL). Receivers use this for the anchor href. */
	url: string;
	title: string;
}

/**
 * User payload — dragged from a user tile (My WordPress users view).
 * Receivers turn this into an anchor pointing at the author archive.
 */
export interface UserDragPayload {
	kind: 'user';
	id: number;
	/** Author archive URL (or profile URL fallback). */
	url: string;
	title: string;
}

/**
 * Stored-file payload — an `upload` tile (desktop storage) lifted in
 * the shell. It is NOT an attachment yet: the file lives outside the
 * Media Library, so there is no attachment id and no public URL to
 * hand a receiver. The shell resolves it to an
 * {@link AttachmentDragPayload} at drop time — copying the file into
 * the Media Library through a registered resolver (see
 * {@link resolveBridgePayload}) — so a receiver never sees this kind
 * on `os-drop`. It can see it on `os-drag-over` and on a payload
 * pull, where it means "a media file is on its way".
 */
export interface UploadDragPayload {
	kind: 'upload';
	/** Stored-file row id (`desktop_mode_stored_files`). */
	fileId: number;
	title: string;
	/** `image/png`, `video/mp4`, … — the stored file's MIME type. */
	mime: string;
	thumbnailUrl?: string;
}

/** Discriminated union of all bridge payload shapes. */
export type DragBridgePayload =
	| AttachmentDragPayload
	| PostDragPayload
	| UserDragPayload
	| UploadDragPayload;

/**
 * Turn a payload that cannot be delivered as-is into one that can.
 * Resolves to `null` when the payload could not be resolved (the
 * resolver is expected to have told the user why).
 */
export type BridgePayloadResolver = (
	payload: DragBridgePayload,
) => Promise< DragBridgePayload | null >;

interface ResolverStore {
	byKind: Map< string, BridgePayloadResolver >;
}

/**
 * The resolver registry, one per page. The bridge and the iframe
 * drop targets compile into the shell bundle, and a feature bundle
 * may register a resolver for its own payload kind — hence a shared
 * store rather than a module-level Map (see `createSharedStore`).
 */
const resolvers = createSharedStore< ResolverStore >(
	'desktop-mode/drag-bridge-resolvers',
	() => ( { byKind: new Map() } ),
);

/**
 * Register the resolver for a payload kind. A kind has at most one
 * resolver; registering again replaces it. Returns a deregister fn.
 *
 * @public
 */
export function registerBridgePayloadResolver(
	kind: DragBridgePayload[ 'kind' ],
	resolver: BridgePayloadResolver,
): () => void {
	resolvers.state.byKind.set( kind, resolver );
	return () => {
		if ( resolvers.state.byKind.get( kind ) === resolver ) {
			resolvers.state.byKind.delete( kind );
		}
	};
}

/** Whether a payload has to go through a resolver before delivery. */
export function bridgePayloadNeedsResolution( payload: DragBridgePayload ): boolean {
	return resolvers.state.byKind.has( payload.kind );
}

/**
 * Resolve a payload for delivery. Payloads without a registered
 * resolver come back unchanged.
 *
 * @public
 */
export async function resolveBridgePayload(
	payload: DragBridgePayload,
): Promise< DragBridgePayload | null > {
	const resolver = resolvers.state.byKind.get( payload.kind );
	if ( ! resolver ) {
		return payload;
	}
	try {
		return await resolver( payload );
	} catch ( err ) {
		// eslint-disable-next-line no-console
		console.error( '[openstation] bridge payload resolver threw:', err );
		return null;
	}
}

/** Public surface — mounted on `wp.os.dragBridge`. */
export interface DragBridgeApi {
	/** Current payload while a cross-frame drag is in flight, or null. */
	getPayload(): DragBridgePayload | null;
	/** True when a cross-frame drag is in progress. */
	isDragging(): boolean;
	/**
	 * Start a bridge session from in-process (the shell). Used when a
	 * DragManager pointer session begins over a shell-rendered tile —
	 * fanning the payload here lets iframe receivers participate via
	 * the same message protocol used by iframe-source drags.
	 *
	 * Idempotent: calling `start` while a session is active overwrites
	 * the payload. Calling it with the same identity payload is a
	 * no-op.
	 */
	start( payload: DragBridgePayload ): void;
	/** End the current session. Idempotent. */
	end(): void;
}

/** Event names we dispatch on `document`. */
export const DRAG_BRIDGE_EVENTS = {
	START: 'os-cross-frame-drag-start',
	END: 'os-cross-frame-drag-end',
} as const;

// -----------------------------------------------------------------------
// Wire types — opaque to TS but used for the postMessage channel.
// -----------------------------------------------------------------------

interface StartMsg {
	type: 'os-drag-start';
	payload: DragBridgePayload;
}
interface EndMsg {
	type: 'os-drag-end';
}
interface PayloadRequestMsg {
	type: 'os-drag-payload-request';
}

type InboundMsg = StartMsg | EndMsg | PayloadRequestMsg;

function isStart( m: unknown ): m is StartMsg {
	return !! m && typeof m === 'object' &&
		( m as { type?: unknown } ).type === 'os-drag-start' &&
		!! ( m as { payload?: unknown } ).payload &&
		typeof ( m as { payload?: unknown } ).payload === 'object';
}
function isEnd( m: unknown ): m is EndMsg {
	return !! m && typeof m === 'object' &&
		( m as { type?: unknown } ).type === 'os-drag-end';
}
function isPayloadRequest( m: unknown ): m is PayloadRequestMsg {
	return !! m && typeof m === 'object' &&
		( m as { type?: unknown } ).type === 'os-drag-payload-request';
}

/**
 * Map the legacy Media Library payload shape (no `kind` field, just
 * the WP attachment record) into the tagged union receivers expect.
 * Pass-through for already-tagged payloads.
 */
function normalizeLegacyPayload(
	payload: DragBridgePayload,
): DragBridgePayload {
	const obj = payload as unknown as { kind?: unknown } & Record<
		string,
		unknown
	>;
	if ( obj.kind !== undefined && obj.kind !== null ) {
		return payload;
	}
	// Look-alike test for the legacy Media Library payload — id +
	// url + mime are the three fields the patch always emits. Any
	// other shape falls through unchanged and the receivers will
	// drop it on the typed shape check.
	if (
		typeof obj.id === 'number' &&
		typeof obj.url === 'string' &&
		typeof obj.mime === 'string'
	) {
		return {
			kind: 'attachment',
			id: obj.id,
			url: obj.url,
			title: typeof obj.title === 'string' ? obj.title : '',
			alt: typeof obj.alt === 'string' ? obj.alt : '',
			mime: obj.mime,
			thumbnailUrl:
				typeof obj.thumbnailUrl === 'string'
					? obj.thumbnailUrl
					: undefined,
			sizes:
				obj.sizes && typeof obj.sizes === 'object'
					? ( obj.sizes as Record< string, unknown > )
					: undefined,
		};
	}
	return payload;
}

// -----------------------------------------------------------------------

export class DragBridge implements DragBridgeApi {
	private _payload: DragBridgePayload | null = null;
	/** Snapshot of the origin at boot so later mutations can't widen trust. */
	private readonly _origin: string;

	constructor() {
		this._origin = window.location.origin;
		window.addEventListener( 'message', this._onMessage );
	}

	getPayload(): DragBridgePayload | null {
		return this._payload;
	}

	isDragging(): boolean {
		return this._payload !== null;
	}

	start( payload: DragBridgePayload ): void {
		if ( this._payload === payload ) {
			return;
		}
		this._startDrag( payload );
	}

	end(): void {
		this._endDrag();
	}

	// -----------------------------------------------------------
	// Internals
	// -----------------------------------------------------------

	private readonly _onMessage = ( e: MessageEvent ): void => {
		// Reject cross-origin messages — the payload is trusted and
		// feeds into drop handlers that may insert HTML. A malicious
		// same-origin script can still forge messages (the browser's
		// same-origin boundary is our real defence), but we don't want
		// to accept messages from cross-origin frames inadvertently
		// embedded in the page.
		if ( e.origin !== this._origin ) {
			return;
		}
		const msg = e.data as InboundMsg | unknown;

		if ( isStart( msg ) ) {
			this._startDrag( msg.payload );
			return;
		}
		if ( isEnd( msg ) ) {
			this._endDrag();
			return;
		}
		if ( isPayloadRequest( msg ) && this._payload && e.source ) {
			// Reply directly to whichever frame asked. e.source is the
			// Window of the posting frame; postMessage on it routes the
			// reply back to that frame only.
			try {
				( e.source as Window ).postMessage(
					{ type: 'os-drag-payload', payload: this._payload },
					this._origin,
				);
			} catch {
				/* cross-origin source (shouldn't happen given the origin check above) */
			}
		}
	};

	private _startDrag( payload: DragBridgePayload ): void {
		// Legacy Media Library patch (`assets/js/media-library-enhanced.js`)
		// emits payloads without a `kind` field — just
		// `{ id, url, title, alt, mime, sizes, thumbnailUrl }`. Normalize
		// to the tagged union here so every downstream consumer
		// (Gutenberg drop-receiver, future plugin receivers) only
		// has to handle one shape. The shape check is conservative —
		// missing or non-matching fields fall through to the typed
		// branch as-is, preserving forward compatibility for plugins
		// that emit their own legitimate payload kinds.
		const normalized = normalizeLegacyPayload( payload );
		this._payload = normalized;
		document.dispatchEvent(
			new CustomEvent( DRAG_BRIDGE_EVENTS.START, {
				detail: { payload: normalized },
			} ),
		);
	}

	private _endDrag(): void {
		if ( this._payload === null ) {
			return;
		}
		const payload = this._payload;
		this._payload = null;
		document.dispatchEvent(
			new CustomEvent( DRAG_BRIDGE_EVENTS.END, { detail: { payload } } ),
		);
	}
}
