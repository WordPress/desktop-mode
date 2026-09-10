import { describe, expect, it, vi } from 'vitest';
import { countWords, fetchMetrics } from './desk-stats';

describe( 'card content metrics', () => {
	it( 'counts the complete text, including adjacent blocks, without scripts or styles', () => {
		expect( countWords( '<p>One two</p><p>Three &amp; four.</p><script>five six seven</script><style>many fake words</style>' ) ).toBe( 4 );
	} );
	it( 'uses the approved comment total, never the size of a paginated comment response', async () => {
		const fetcher = vi.fn( async ( path: string, _init?: RequestInit, _options?: { silent?: boolean } ) => path.includes( 'comments?' ) ? new Response( null, { headers: { 'X-WP-Total': '124' } } ) : new Response( JSON.stringify( { content: { rendered: '<p>A complete story</p>' } } ) ) );
		const signal = new AbortController().signal;
		expect( await fetchMetrics( fetcher, 'posts', 7, signal ) ).toEqual( { words: 3, comments: 124 } );
		expect( fetcher.mock.calls.every( ( call ) => call[ 2 ]?.silent === true ) ).toBe( true );
		expect( fetcher.mock.calls[ 1 ][ 1 ] ).toEqual( { method: 'HEAD', signal } );
	} );
	it( 'keeps unavailable counts unknown while preserving a real zero', async () => {
		const denied = async () => new Response( null, { status: 403 } );
		expect( await fetchMetrics( denied, 'pages', 7, new AbortController().signal ) ).toEqual( { words: null, comments: null, errors: { words: 'unavailable', comments: 'unavailable' } } );
		const empty = async ( path: string ) => path.includes( 'comments?' ) ? new Response( null, { headers: { 'X-WP-Total': '0' } } ) : new Response( JSON.stringify( { content: { rendered: '' } } ) );
		expect( await fetchMetrics( empty, 'pages', 7, new AbortController().signal ) ).toEqual( { words: 0, comments: 0 } );
	} );
} );

it( 'retries transient failures with a limit, permits explicit retry, and cancels timers on close', async () => {
	vi.useFakeTimers();
	let intersect!: IntersectionObserverCallback;
	vi.stubGlobal( 'IntersectionObserver', class {
		constructor( callback: IntersectionObserverCallback ) {
			intersect = callback;
		}
		observe() {} unobserve() {} disconnect() {}
	} );
	const root = document.createElement( 'div' );
	root.innerHTML = '<div data-content-metrics="7:date" data-post-id="7"><os-stat data-metric="words"></os-stat><os-stat data-metric="comments"></os-stat></div>';
	const fetcher = vi.fn( async () => new Response( null, { status: 503 } ) );
	const { createDeskStats } = await import( './desk-stats' );
	const stats = createDeskStats( root, fetcher, 'posts' );
	try {
		stats.sync(); intersect( [ { isIntersecting: true, target: root.firstElementChild } as IntersectionObserverEntry ], {} as IntersectionObserver );
		await vi.advanceTimersByTimeAsync( 2000 );
		expect( fetcher ).toHaveBeenCalledTimes( 6 );
		expect( root.querySelector( '[data-metric="words"]' )?.getAttribute( 'title' ) ).toContain( 'Could not load' );
		( root.querySelector( '[data-retry-metrics]' ) as HTMLElement ).click();
		await vi.advanceTimersByTimeAsync( 0 );
		expect( fetcher ).toHaveBeenCalledTimes( 8 );
		stats.dispose(); await vi.advanceTimersByTimeAsync( 10000 );
		expect( fetcher ).toHaveBeenCalledTimes( 8 );
	} finally {
		stats.dispose(); vi.useRealTimers(); vi.unstubAllGlobals();
	}
} );
