import { describe, expect, it, vi } from 'vitest';
import { arrangePages, connectPages, loadAtlas, previewUrl, type AtlasPage } from './atlas-model';
import { zoomAt } from './atlas-camera';
const page = ( id: number, extra: Partial< AtlasPage > = {} ): AtlasPage => ( { id, parent: 0, title: { rendered: `Page ${ id }` }, slug: `page-${ id }`, link: `http://localhost/page-${ id }/`, status: 'publish', ...extra } );

describe( 'the authored page atlas', () => {
	it( 'keeps hierarchy distinct from directed body links, deduplicates links and ignores external/self/unknown URLs', () => {
		const pages = [ page( 1, { content: { rendered: '<a href="/page-2/#title">two</a><a href="/?page_id=2">again</a><a href="https://elsewhere.test/?page_id=2">external</a><a href="/page-1/">self</a><a href="/missing/">unknown</a>' } } ), page( 2, { parent: 1 } ), page( 3 ) ];
		expect( connectPages( pages ) ).toEqual( [ { from: 1, to: 2, kind: 'link' }, { from: 1, to: 2, kind: 'parent' } ] );
	} );
	it( 'does not infer links from protected content or absent parents', () => {
		expect( connectPages( [ page( 1, { parent: 99, content: { protected: true, rendered: '<a href="/page-2/">Hidden</a>' } } ), page( 2 ) ] ) ).toEqual( [] );
	} );
	it( 'packs every page exactly once even with a broken parent cycle and keeps home first', () => {
		const nodes = arrangePages( [ page( 1, { parent: 2 } ), page( 2, { parent: 1 } ), page( 3 ) ], 3 );
		expect( nodes.map( ( n ) => n.page.id ) ).toEqual( [ 3, 1, 2 ] );
		expect( new Set( nodes.map( ( n ) => `${ n.x },${ n.y }` ) ).size ).toBe( 3 );
	} );
	it( 'only embeds same-origin frontend URLs and enables draft previews', () => {
		expect( previewUrl( page( 1, { status: 'draft' } ), 'http://localhost' ) ).toBe( 'http://localhost/page-1/?preview=true' );
		for ( const link of [ 'javascript:alert(1)', 'https://elsewhere.test/', 'http://localhost/wp-admin/post.php', 'http://localhost/wp-login.php' ] ) {
			expect( previewUrl( page( 1, { link } ), 'http://localhost' ) ).toBeNull();
		}
	} );
	it( 'reads all server pages, carries cancellation and reports a bounded partial map', async () => {
		const fetcher = vi.fn( async ( path: string, _init?: RequestInit ) => {
			const index = Number( new URL( path, 'http://localhost' ).searchParams.get( 'page' ) );
			return new Response( JSON.stringify( [ page( index ) ] ), { headers: { 'X-WP-TotalPages': '9', 'X-WP-Total': '900' } } );
		} );
		const signal = new AbortController().signal;
		const data = await loadAtlas( fetcher, signal );
		expect( fetcher ).toHaveBeenCalledTimes( 5 );
		expect( fetcher.mock.calls[ 0 ][ 1 ] ).toEqual( { signal } );
		expect( data.pages ).toHaveLength( 5 ); expect( data.total ).toBe( 900 );
	} );
	it( 'surfaces permission failures instead of an empty success', async () => {
		await expect( loadAtlas( async () => new Response( '', { status: 403 } ), new AbortController().signal ) ).rejects.toThrow( 'could not be loaded' );
	} );
	it( 'zooms around the pointer without changing the document viewport', () => {
		const camera = { x: 30, y: 40, zoom: .5 };
		const world = { x: ( 200 - camera.x ) / camera.zoom, y: ( 150 - camera.y ) / camera.zoom };
		zoomAt( camera, 1, 200, 150 );
		expect( camera.x + world.x * camera.zoom ).toBe( 200 ); expect( camera.y + world.y * camera.zoom ).toBe( 150 );
		zoomAt( camera, 99, 0, 0 ); expect( camera.zoom ).toBe( 1.8 );
	} );
} );
