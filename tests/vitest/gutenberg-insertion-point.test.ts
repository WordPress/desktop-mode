/**
 * Tests for the insertion-point lookup the Gutenberg drop receiver
 * runs on every streamed pointer position: which block list, and
 * which index in it, a pointer over the editor DOM maps to.
 *
 * jsdom has no layout, so every block gets an explicit rect and
 * `elementFromPoint` is answered from those rects.
 */
import { afterEach, describe, expect, test } from 'vitest';
import {
	computeInsertionPoint,
	resolveCanvasPoint,
	sameInsertionPoint,
} from '../../src/gutenberg-insertion-point';

interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}

function setRect( el: HTMLElement, rect: Rect ): void {
	el.getBoundingClientRect = () =>
		( {
			...rect,
			right: rect.left + rect.width,
			bottom: rect.top + rect.height,
			x: rect.left,
			y: rect.top,
			toJSON: () => rect,
		} ) as DOMRect;
}

function contains( el: HTMLElement, x: number, y: number ): boolean {
	const r = el.getBoundingClientRect();
	return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
}

/**
 * Answer `elementFromPoint` with the deepest element whose rect
 * contains the point, walking the given list in document order.
 */
function installHitTest( doc: Document, candidates: HTMLElement[] ): void {
	doc.elementFromPoint = ( x: number, y: number ) => {
		let hit: HTMLElement | null = null;
		for ( const el of candidates ) {
			if ( contains( el, x, y ) ) {
				hit = el; // later (deeper) candidates win
			}
		}
		return hit;
	};
}

/**
 * Root layout 0–400 wide, 0–300 tall: block A (0–100), block B
 * (100–200) which is a Group holding a nested layout with block C
 * (110–190), then empty space to 300.
 */
function mountEditor( doc: Document = document ): {
	root: HTMLElement;
	a: HTMLElement;
	b: HTMLElement;
	inner: HTMLElement;
	c: HTMLElement;
} {
	const root = doc.createElement( 'div' );
	root.className = 'block-editor-block-list__layout is-root-container';
	setRect( root, { left: 0, top: 0, width: 400, height: 300 } );

	const a = doc.createElement( 'div' );
	a.setAttribute( 'data-block', 'aaa' );
	setRect( a, { left: 0, top: 0, width: 400, height: 100 } );

	const b = doc.createElement( 'div' );
	b.setAttribute( 'data-block', 'bbb' );
	setRect( b, { left: 0, top: 100, width: 400, height: 100 } );

	const inner = doc.createElement( 'div' );
	inner.className = 'block-editor-block-list__layout';
	setRect( inner, { left: 0, top: 105, width: 400, height: 90 } );

	const c = doc.createElement( 'div' );
	c.setAttribute( 'data-block', 'ccc' );
	setRect( c, { left: 0, top: 110, width: 400, height: 80 } );

	inner.appendChild( c );
	b.appendChild( inner );
	root.appendChild( a );
	root.appendChild( b );
	doc.body.appendChild( root );
	installHitTest( doc, [ root, a, b, inner, c ] );
	return { root, a, b, inner, c };
}

afterEach( () => {
	document.body.innerHTML = '';
} );

describe( 'computeInsertionPoint', () => {
	test( 'the top half of a root block inserts before it, the bottom half after', () => {
		mountEditor();
		expect( computeInsertionPoint( document, 50, 20 ) ).toEqual( { rootClientId: '', index: 0 } );
		expect( computeInsertionPoint( document, 50, 80 ) ).toEqual( { rootClientId: '', index: 1 } );
	} );

	test( 'a nested block resolves against its parent list', () => {
		mountEditor();
		// C sits inside B's inner list: before C, then after C.
		expect( computeInsertionPoint( document, 50, 120 ) ).toEqual( { rootClientId: 'bbb', index: 0 } );
		expect( computeInsertionPoint( document, 50, 180 ) ).toEqual( { rootClientId: 'bbb', index: 1 } );
	} );

	test( 'the empty space of a list appends, or inserts before the first block below', () => {
		mountEditor();
		// Below every root block.
		expect( computeInsertionPoint( document, 50, 250 ) ).toEqual( { rootClientId: '', index: 2 } );
		// Inside B's inner list but above C (105–110).
		expect( computeInsertionPoint( document, 50, 107 ) ).toEqual( { rootClientId: 'bbb', index: 0 } );
	} );

	test( 'a horizontal list splits blocks on the x axis', () => {
		const root = document.createElement( 'div' );
		root.className = 'block-editor-block-list__layout is-root-container';
		setRect( root, { left: 0, top: 0, width: 400, height: 100 } );
		const columns = document.createElement( 'div' );
		columns.setAttribute( 'data-block', 'cols' );
		setRect( columns, { left: 0, top: 0, width: 400, height: 100 } );
		const row = document.createElement( 'div' );
		row.className = 'block-editor-block-list__layout is-horizontal';
		setRect( row, { left: 0, top: 0, width: 400, height: 100 } );
		const left = document.createElement( 'div' );
		left.setAttribute( 'data-block', 'left' );
		setRect( left, { left: 0, top: 0, width: 200, height: 100 } );
		const right = document.createElement( 'div' );
		right.setAttribute( 'data-block', 'right' );
		setRect( right, { left: 200, top: 0, width: 200, height: 100 } );
		row.append( left, right );
		columns.appendChild( row );
		root.appendChild( columns );
		document.body.appendChild( root );
		installHitTest( document, [ root, columns, row, left, right ] );

		expect( computeInsertionPoint( document, 50, 50 ) ).toEqual( { rootClientId: 'cols', index: 0 } );
		expect( computeInsertionPoint( document, 150, 50 ) ).toEqual( { rootClientId: 'cols', index: 1 } );
		expect( computeInsertionPoint( document, 350, 50 ) ).toEqual( { rootClientId: 'cols', index: 2 } );
	} );

	test( 'a pointer outside the block list resolves to nothing', () => {
		mountEditor();
		const sidebar = document.createElement( 'div' );
		setRect( sidebar, { left: 400, top: 0, width: 200, height: 300 } );
		document.body.appendChild( sidebar );
		installHitTest( document, [ sidebar ] );
		expect( computeInsertionPoint( document, 500, 50 ) ).toBeNull();
		document.elementFromPoint = () => null;
		expect( computeInsertionPoint( document, 900, 900 ) ).toBeNull();
	} );
} );

describe( 'blocks inside the editor-canvas iframe', () => {
	test( 'resolve across the realm boundary, translated by the frame offset', () => {
		const frame = document.createElement( 'iframe' );
		frame.name = 'editor-canvas';
		document.body.appendChild( frame );
		setRect( frame, { left: 40, top: 60, width: 800, height: 600 } );
		const canvasDoc = frame.contentDocument as Document;
		// The bug this pins: the canvas document's elements are not
		// `instanceof` the receiver realm's HTMLElement.
		expect( canvasDoc.body instanceof HTMLElement ).toBe( false );
		mountEditor( canvasDoc );

		const lookup = ( x: number, y: number ) => {
			const p = resolveCanvasPoint( document, x, y );
			return computeInsertionPoint( p.doc, p.x, p.y );
		};
		// (90, 80) in the outer viewport is (50, 20) in the canvas: A's top half.
		expect( lookup( 90, 80 ) ).toEqual( { rootClientId: '', index: 0 } );
		// (90, 140) → (50, 80): A's bottom half.
		expect( lookup( 90, 140 ) ).toEqual( { rootClientId: '', index: 1 } );
		// (90, 240) → (50, 180): after C, inside B's list.
		expect( lookup( 90, 240 ) ).toEqual( { rootClientId: 'bbb', index: 1 } );
		// (90, 310) → (50, 250): below every root block.
		expect( lookup( 90, 310 ) ).toEqual( { rootClientId: '', index: 2 } );
	} );
} );

describe( 'resolveCanvasPoint', () => {
	test( 'translates into the editor-canvas iframe when there is one', () => {
		const frame = document.createElement( 'iframe' );
		frame.name = 'editor-canvas';
		document.body.appendChild( frame );
		setRect( frame, { left: 40, top: 60, width: 800, height: 600 } );
		const point = resolveCanvasPoint( document, 100, 100 );
		expect( point.doc ).toBe( frame.contentDocument );
		expect( point.doc ).not.toBe( document );
		expect( point ).toMatchObject( { x: 60, y: 40 } );
	} );

	test( 'passes through without a canvas iframe', () => {
		expect( resolveCanvasPoint( document, 100, 100 ) ).toEqual( { doc: document, x: 100, y: 100 } );
	} );
} );

describe( 'sameInsertionPoint', () => {
	test( 'compares list and index, and treats null as its own value', () => {
		expect( sameInsertionPoint( { rootClientId: '', index: 1 }, { rootClientId: '', index: 1 } ) ).toBe( true );
		expect( sameInsertionPoint( { rootClientId: '', index: 1 }, { rootClientId: 'x', index: 1 } ) ).toBe( false );
		expect( sameInsertionPoint( { rootClientId: '', index: 1 }, { rootClientId: '', index: 2 } ) ).toBe( false );
		expect( sameInsertionPoint( null, null ) ).toBe( true );
		expect( sameInsertionPoint( null, { rootClientId: '', index: 0 } ) ).toBe( false );
	} );
} );
