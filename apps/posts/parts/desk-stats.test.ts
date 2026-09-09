import { describe, expect, it, vi } from 'vitest';
import { countWords, fetchMetrics } from './desk-stats';

describe( 'card content metrics', () => {
	it( 'counts the complete text, including adjacent blocks, without scripts or styles', () => {
		expect( countWords( '<p>One two</p><p>Three &amp; four.</p><script>five six seven</script><style>many fake words</style>' ) ).toBe( 4 );
	} );
	it( 'uses the approved comment total, never the size of a paginated comment response', async () => {
		const fetcher = vi.fn( async ( path: string, _init?: RequestInit ) => path.includes( 'comments?' ) ? new Response( null, { headers: { 'X-WP-Total': '124' } } ) : new Response( JSON.stringify( { content: { rendered: '<p>A complete story</p>' } } ) ) );
		const signal = new AbortController().signal;
		expect( await fetchMetrics( fetcher, 'posts', 7, signal ) ).toEqual( { words: 3, comments: 124 } );
		expect( fetcher.mock.calls[ 1 ][ 1 ] ).toEqual( { method: 'HEAD', signal } );
	} );
	it( 'keeps unavailable counts unknown while preserving a real zero', async () => {
		const denied = async () => new Response( null, { status: 403 } );
		expect( await fetchMetrics( denied, 'pages', 7, new AbortController().signal ) ).toEqual( { words: null, comments: null } );
		const empty = async ( path: string ) => path.includes( 'comments?' ) ? new Response( null, { headers: { 'X-WP-Total': '0' } } ) : new Response( JSON.stringify( { content: { rendered: '' } } ) );
		expect( await fetchMetrics( empty, 'pages', 7, new AbortController().signal ) ).toEqual( { words: 0, comments: 0 } );
	} );
} );
