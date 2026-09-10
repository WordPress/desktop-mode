import { describe, expect, it } from 'vitest';
import { layoutAtlas, routeThread } from './atlas-layout';
import { SHEET_WIDTH, SHEET_HEIGHT, type AtlasPage, type AtlasEdge } from './atlas-model';
const pages = Array.from( { length: 40 }, ( _, i ) => ( { id: i + 1, parent: 0, title: { rendered: `Page ${ i }` }, slug: `p${ i }`, link: `http://localhost/p${ i }`, status: 'publish' } as AtlasPage ) );
const edges: AtlasEdge[] = pages.slice( 0, 27 ).flatMap( ( p, i ) => [ { from: p.id, to: ( i + 1 ) % 27 + 1, kind: 'parent' }, { from: p.id, to: ( i + 7 ) % 27 + 1, kind: 'link' } ] as AtlasEdge[] );
describe( 'page atlas layout and routing', () => {
	it( 'places cycles, dense families and isolated pages deterministically without overlaps', () => {
		const nodes = layoutAtlas( pages, edges, 1 );
		expect( nodes ).toEqual( layoutAtlas( pages, edges, 1 ) );
		expect( new Set( nodes.map( ( n ) => `${ n.x },${ n.y }` ) ).size ).toBe( pages.length );
		expect( nodes.every( ( n ) => Number.isFinite( n.x ) && Number.isFinite( n.y ) ) ).toBe( true );
	} );
	it( 'routes every segment through gaps without entering unrelated sheets', () => {
		const nodes = layoutAtlas( pages, edges );
		edges.forEach( ( edge, lane ) => {
			const points = routeThread( nodes.find( ( n ) => n.page.id === edge.from )!, nodes.find( ( n ) => n.page.id === edge.to )!, lane );
			points.slice( 1 ).forEach( ( end, index ) => {
				const start = points[ index ];
				expect( start.x === end.x || start.y === end.y ).toBe( true );
				for ( const node of nodes.filter( ( n ) => n.page.id !== edge.from && n.page.id !== edge.to ) ) {
					const crosses = start.x === end.x
						? start.x > node.x && start.x < node.x + SHEET_WIDTH && Math.max( start.y, end.y ) > node.y && Math.min( start.y, end.y ) < node.y + SHEET_HEIGHT
						: start.y > node.y && start.y < node.y + SHEET_HEIGHT && Math.max( start.x, end.x ) > node.x && Math.min( start.x, end.x ) < node.x + SHEET_WIDTH;
					expect( crosses, `edge ${ edge.from }-${ edge.to } crosses ${ node.page.id }` ).toBe( false );
				}
			} );
		} );
	} );
} );
