/**
 * OpenStation — where in the block editor a cross-frame drop lands.
 *
 * Gutenberg draws its own blue insertion line from the block-editor
 * store (`showInsertionPoint( rootClientId, index )`), and inserts at
 * the same `( index, rootClientId )` pair. What the store cannot do
 * is tell us that pair for a pointer position that arrives over
 * postMessage — the browser never fired a `dragover` inside the
 * editor, because the parent shell suppressed pointer events on the
 * window's iframe so its own drag ghost could keep tracking.
 *
 * So this module reads the editor DOM the way Gutenberg's drop zone
 * does: every block wrapper carries `data-block="<clientId>"` and
 * sits directly in a `.block-editor-block-list__layout`; the layout
 * of nested blocks sits inside its parent's wrapper, and the root
 * layout inside none. The pointer is compared against the midpoint
 * of the innermost block under it (the cross axis for a horizontal
 * list, e.g. Columns), and a pointer over a layout's empty space
 * inserts before the first block below it, or appends.
 *
 * Pure DOM in, `{ rootClientId, index }` out. No store access, no
 * shell imports — it compiles into the receiver bundle.
 */

export interface InsertionPoint {
	/** Client id of the block whose inner list receives the insert; `''` for the root. */
	rootClientId: string;
	/** Position within that list. */
	index: number;
}

export interface CanvasPoint {
	doc: Document;
	x: number;
	y: number;
}

const LAYOUT_SELECTOR = '.block-editor-block-list__layout';
const BLOCK_SELECTOR = '[data-block]';
const CANVAS_IFRAME_SELECTOR = 'iframe[name="editor-canvas"]';

/**
 * Translate a point in `doc`'s viewport into the editor canvas
 * iframe's document, when the editor renders in one (every modern
 * post editor does). Falls back to `doc` itself for a same-document
 * canvas, or when the canvas frame is not readable.
 *
 * @public
 */
export function resolveCanvasPoint( doc: Document, x: number, y: number ): CanvasPoint {
	const frame = doc.querySelector< HTMLIFrameElement >( CANVAS_IFRAME_SELECTOR );
	if ( ! frame ) {
		return { doc, x, y };
	}
	let inner: Document | null = null;
	try {
		inner = frame.contentDocument;
	} catch {
		inner = null;
	}
	if ( ! inner ) {
		return { doc, x, y };
	}
	const rect = frame.getBoundingClientRect();
	return { doc: inner, x: x - rect.left, y: y - rect.top };
}

/**
 * Never `instanceof HTMLElement` here: the canvas iframe's elements
 * belong to another realm, where `HTMLElement` is a different
 * constructor, and the check is false for every block in the editor.
 */
function isElement( node: unknown ): node is HTMLElement {
	return !! node && ( node as Node ).nodeType === 1;
}

function blocksOf( layout: Element ): HTMLElement[] {
	return Array.from( layout.children ).filter(
		( el ): el is HTMLElement => isElement( el ) && el.hasAttribute( 'data-block' ),
	);
}

function rootClientIdOf( layout: Element ): string {
	const owner = layout.parentElement?.closest( BLOCK_SELECTOR );
	return owner ? owner.getAttribute( 'data-block' ) ?? '' : '';
}

function isHorizontal( layout: Element ): boolean {
	if ( layout.classList.contains( 'is-horizontal' ) ) {
		return true;
	}
	const view = layout.ownerDocument.defaultView;
	if ( ! view ) {
		return false;
	}
	const style = view.getComputedStyle( layout );
	return style.display === 'flex' && ( style.flexDirection === 'row' || style.flexDirection === 'row-reverse' );
}

/**
 * The insertion point for a pointer at `( x, y )` in `doc`'s viewport
 * — `doc` being the document that holds the block list (use
 * {@link resolveCanvasPoint} first when the editor is in a canvas
 * iframe). `null` when the pointer is not over the block list at all
 * (the sidebar, the top bar), which callers treat as "no indicator,
 * insert at the default spot".
 *
 * @public
 */
export function computeInsertionPoint( doc: Document, x: number, y: number ): InsertionPoint | null {
	const hit = doc.elementFromPoint( x, y );
	if ( ! hit ) {
		return null;
	}

	// Innermost list and innermost block wrapper above the hit. When
	// the block is inside the list, the pointer is over that block;
	// when the list is inside the block, the pointer is in the empty
	// space of a nested list (a Group's padding, below its last child).
	const nearestLayout = hit.closest( LAYOUT_SELECTOR );
	const block = hit.closest( BLOCK_SELECTOR );
	if ( isElement( block ) && ( ! nearestLayout || nearestLayout.contains( block ) ) ) {
		const layout = block.parentElement?.closest( LAYOUT_SELECTOR );
		if ( ! layout ) {
			return null;
		}
		const siblings = blocksOf( layout );
		const idx = siblings.indexOf( block );
		if ( idx === -1 ) {
			return null;
		}
		const rect = block.getBoundingClientRect();
		const after = isHorizontal( layout )
			? x > rect.left + rect.width / 2
			: y > rect.top + rect.height / 2;
		return { rootClientId: rootClientIdOf( layout ), index: idx + ( after ? 1 : 0 ) };
	}

	// Empty space in a list: before the first block past the pointer,
	// else at the end.
	const layout = nearestLayout;
	if ( ! layout ) {
		return null;
	}
	const siblings = blocksOf( layout );
	const horizontal = isHorizontal( layout );
	for ( let i = 0; i < siblings.length; i++ ) {
		const rect = siblings[ i ].getBoundingClientRect();
		const startsPast = horizontal ? rect.left > x : rect.top > y;
		if ( startsPast ) {
			return { rootClientId: rootClientIdOf( layout ), index: i };
		}
	}
	return { rootClientId: rootClientIdOf( layout ), index: siblings.length };
}

/** Two insertion points are the same spot. */
export function sameInsertionPoint(
	a: InsertionPoint | null,
	b: InsertionPoint | null,
): boolean {
	if ( ! a || ! b ) {
		return a === b;
	}
	return a.rootClientId === b.rootClientId && a.index === b.index;
}
