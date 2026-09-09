import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAtlasScene } from './atlas-scene';
import { atlasStyles } from './atlas.styles';
import type { AtlasData } from './atlas-model';
const mocks = vi.hoisted( () => ( { destroy: vi.fn(), render: vi.fn() } ) );
vi.mock( '../../posts/parts/canvas/pixi', () => {
	class Graphics {
		clear() {
			return this;
		} moveTo() {
			return this;
		} bezierCurveTo() {
			return this;
		}
		lineTo() {
			return this;
		} stroke() {
			return this;
		} circle() {
			return this;
		} fill() {
			return this;
		}
	}
	return {
		loadPixi: async () => ( { Graphics } ),
		createPixiApp: async () => ( { app: { render: mocks.render, ticker: { stop: vi.fn() }, renderer: { resize: vi.fn() } }, world: { addChild: vi.fn(), scale: { set: vi.fn() } } } ),
		destroyPixiApp: ( _app: unknown, host: HTMLElement ) => {
			mocks.destroy(); host.replaceChildren();
		},
	};
} );
beforeEach( () => {
	vi.useFakeTimers(); vi.clearAllMocks(); vi.stubGlobal( 'ResizeObserver', class {
		observe() {} disconnect() {}
	} );
} );
afterEach( () => {
	vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren();
} );

describe( 'live page sheets', () => {
	it( 'bounds iframe count, fixes desktop viewport dimensions through zoom, and releases resources', async () => {
		const stage = document.createElement( 'div' ); document.body.append( stage );
		Object.defineProperties( stage, { clientWidth: { value: 1200 }, clientHeight: { value: 900 } } );
		const data: AtlasData = { total: 9, edges: [], pages: Array.from( { length: 9 }, ( _, i ) => ( { id: i + 1, parent: 0, title: { rendered: `Page ${ i + 1 }` }, link: `${ location.origin }/page-${ i + 1 }/`, slug: `page-${ i + 1 }`, status: 'publish' } ) ) };
		const scene = await createAtlasScene( stage, data, undefined, vi.fn(), vi.fn(), new AbortController().signal );
		await vi.advanceTimersByTimeAsync( 180 );
		expect( stage.querySelectorAll( 'iframe' ) ).toHaveLength( 6 );
		const frame = stage.querySelector( 'iframe' )!;
		expect( [ frame.width, frame.height ] ).toEqual( [ '1440', '900' ] );
		expect( frame.hasAttribute( 'inert' ) ).toBe( true );
		expect( frame.getAttribute( 'aria-hidden' ) ).toBe( 'true' );
		expect( atlasStyles.cssText ).toContain( 'pointer-events: none' );
		expect( frame.tabIndex ).toBe( -1 );
		scene!.zoom( 1.25 );
		expect( [ frame.width, frame.height ] ).toEqual( [ '1440', '900' ] );
		expect( atlasStyles.cssText ).toContain( 'transform: scale(.2)' );
		scene!.dispose();
		expect( stage.querySelectorAll( 'iframe' ) ).toHaveLength( 0 ); expect( mocks.destroy ).toHaveBeenCalledOnce();
	} );
	it( 'does not mount a renderer for a window closed during module loading', async () => {
		const controller = new AbortController(); controller.abort();
		expect( await createAtlasScene( document.createElement( 'div' ), { total: 0, pages: [], edges: [] }, undefined, vi.fn(), vi.fn(), controller.signal ) ).toBeNull();
	} );
} );
