import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createChipStore } from '../../apps/posts/parts/mindmap-chips';
import { createTagChip, layoutTagChip, type TagBox } from '../../apps/posts/parts/cloud-chips';
import { badgeInk, readCanvasPalette, type CanvasPalette } from '../../apps/posts/parts/canvas/palette';
import { createInteraction } from '../../apps/posts/parts/canvas/camera';
import type { PixiNamespace, PixiContainer } from '../../apps/posts/parts/canvas/pixi';
import type { MindNode } from '../../apps/posts/parts/mindmap-draw';
import type { TermRow } from '../../apps/posts/parts/types';

const dark: CanvasPalette = { surface: 0x1a1721, raised: 0x33303a, fg: 0xfffbff, muted: 0xb3afb5, faint: 0x66636b, border: 0x33303a, accent: 0xf252fc };
const light: CanvasPalette = { surface: 0xffffff, raised: 0xf6f7f7, fg: 0x1d2327, muted: 0x50575e, faint: 0xb0b3b8, border: 0xdcdcde, accent: 0x2271b1 };
class Node {
	children: Node[] = [];
	style: Record< string, unknown > = {};
	text = '';
	width = 50;
	height = 16;
	x = 0;
	y = 0;
	alpha = 1;
	scale = { set: vi.fn() };
	fills: unknown[] = [];
	events = new Map< string, () => void >();
	constructor( opts?: { text: string; style: Record< string, unknown > } ) { if ( opts ) { this.text = opts.text; this.style = opts.style; } }
	addChild( child: Node ) { this.children.push( child ); return child; }
	on( event: string, callback: () => void ) { this.events.set( event, callback ); }
	clear() { this.fills = []; return this; }
	roundRect() { return this; }
	fill( value: unknown ) { this.fills.push( value ); return this; }
	stroke() { return this; }
}
const pixi = { Container: Node, Graphics: Node, Text: Node } as unknown as PixiNamespace;
afterEach( () => { vi.restoreAllMocks(); document.body.replaceChildren(); } );

describe( 'content explorer palette', () => {
	it( 'resolves paint inside the actual stage, including a new inherited theme', () => {
		const host = document.createElement( 'div' ); document.body.append( host );
		let ink = 'rgb(255, 251, 255)';
		vi.spyOn( window, 'getComputedStyle' ).mockImplementation( ( node ) => {
			expect( node.parentElement ).toBe( host );
			return { color: ink } as CSSStyleDeclaration;
		} );
		expect( readCanvasPalette( host ).fg ).toBe( dark.fg );
		ink = 'rgb(29, 35, 39)';
		expect( readCanvasPalette( host ).fg ).toBe( light.fg );
		expect( host.children ).toHaveLength( 0 );
	} );

	it.each( [ dark, light ] )( 'uses readable theme ink on bright and dark data badges', ( palette ) => {
		expect( badgeInk( 0xffffff, palette ) ).toBe( palette === dark ? dark.surface : light.fg );
		expect( badgeInk( 0x000000, palette ) ).toBe( palette === dark ? dark.fg : light.surface );
	} );

	it( 'repaints category labels without replacing their nodes and rejects taps during a pinch', () => {
		const palette = { ...dark };
		const layer = new Node();
		const interaction = createInteraction();
		const onTap = vi.fn();
		const store = createChipStore( pixi, layer as unknown as PixiContainer, interaction, { palette, isFocused: () => false, onTap } );
		const node = { id: 2, name: 'News', count: 10, color: 0x226688 } as MindNode;
		store.relayout( node );
		const chip = layer.children[ 0 ];
		expect( chip.children[ 1 ].style.fill ).toBe( dark.fg );
		expect( chip.children[ 0 ].fills ).toContainEqual( { color: dark.surface, alpha: 1 } );
		interaction.pinchUntil = Infinity;
		chip.events.get( 'pointertap' )!();
		expect( onTap ).not.toHaveBeenCalled();
		interaction.pinchUntil = 0;
		chip.events.get( 'pointertap' )!();
		expect( onTap ).toHaveBeenCalledWith( 2 );
		Object.assign( palette, light ); store.relayout( node );
		expect( layer.children[ 0 ] ).toBe( chip );
		expect( chip.children[ 1 ].style.fill ).toBe( light.fg );
		expect( chip.children[ 0 ].fills ).toContainEqual( { color: light.surface, alpha: 1 } );
	} );

	it( 'paints tag labels, hover and focus with the current palette', () => {
		const term = { id: 4, name: 'Design', count: 12 } as TermRow;
		const chip = createTagChip( pixi, new Node() as unknown as PixiContainer, term, 18, dark );
		const box = { ...term, chip, hue: 200, fontSize: 18 } as TagBox;
		layoutTagChip( box, false, dark );
		expect( chip.nameText.style.fill ).toBe( dark.fg );
		expect( ( chip.bg as unknown as Node ).fills[ 0 ] ).toBe( dark.surface );
		layoutTagChip( box, true, dark );
		expect( ( chip.bg as unknown as Node ).fills[ 0 ] ).toBe( dark.raised );
		layoutTagChip( box, false, light );
		expect( chip.nameText.style.fill ).toBe( light.fg );
		expect( ( chip.bg as unknown as Node ).fills[ 0 ] ).toBe( light.surface );
	} );

	it( 'routes notebook rules and explorer toolbar backgrounds through declared palette tokens', () => {
		const paper = readFileSync( 'apps/posts/parts/paper.styles.ts', 'utf8' );
		const css = readFileSync( 'apps/posts/posts.css', 'utf8' );
		const palette = readFileSync( 'assets/css/variables.css', 'utf8' );
		expect( paper ).not.toContain( '--os-ui-border-subtle' );
		expect( paper ).toContain( 'var( --os-ui-surface-subtle, #f0f0f1 )' );
		expect( palette ).toContain( '--os-ui-surface-subtle:' );
		expect( css ).not.toMatch( /background:\s*rgba\(\s*255,\s*255,\s*255/ );
	} );
} );

it( 'composites translucent tokens and observes both theme and accent changes until disposal', async () => {
	const { readCanvasColor, watchCanvasPalette } = await import( '../../apps/posts/parts/canvas/palette' );
	const host = document.createElement( 'div' ); document.body.append( host );
	let ink = 'rgba(255, 0, 0, 0.5)';
	vi.spyOn( window, 'getComputedStyle' ).mockImplementation( () => ( { color: ink } as CSSStyleDeclaration ) );
	expect( readCanvasColor( host, '--os-ui-accent', '#000000', 0x000000 ) ).toBe( 0x800000 );
	ink = 'color(srgb 0 1 0 / 0.25)';
	expect( readCanvasColor( host, '--os-ui-accent', '#000000', 0x000000 ) ).toBe( 0x004000 );
	const changed = vi.fn(); const dispose = watchCanvasPalette( host, changed );
	ink = 'rgb(0, 0, 255)'; document.body.style.setProperty( '--os-ui-accent', 'blue' );
	await Promise.resolve(); expect( changed ).toHaveBeenCalledTimes( 1 );
	ink = 'rgb(255, 0, 0)'; document.dispatchEvent( new Event( 'os-desktop-theme-changed' ) );
	expect( changed ).toHaveBeenCalledTimes( 2 );
	dispose(); ink = 'rgb(0, 255, 0)'; document.body.style.setProperty( '--os-ui-accent', 'green' );
	document.dispatchEvent( new Event( 'os-desktop-theme-changed' ) ); await Promise.resolve();
	expect( changed ).toHaveBeenCalledTimes( 2 ); document.body.style.removeProperty( '--os-ui-accent' );
} );
