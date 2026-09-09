/** Real content metrics, loaded only for cards entering the viewport. */
import type { RestFetch } from './rest';

export interface ContentMetrics { words: number | null; comments: number | null }

/** Count the complete rendered body; excerpts and markup are not word counts. */
export function countWords( markup: string ): number {
	const doc = new DOMParser().parseFromString( markup, 'text/html' );
	doc.querySelectorAll( 'script, style' ).forEach( ( node ) => node.remove() );
	doc.querySelectorAll( 'p, div, li, h1, h2, h3, h4, h5, h6, br' ).forEach( ( node ) => node.append( doc.createTextNode( ' ' ) ) );
	const text = doc.body.textContent || '';
	const Segmenter = ( Intl as unknown as { Segmenter?: new ( locale: undefined, options: { granularity: 'word' } ) => { segment( input: string ): Iterable< { isWordLike: boolean } > } } ).Segmenter;
	return Segmenter ? Array.from( new Segmenter( undefined, { granularity: 'word' } ).segment( text ) ).filter( ( part ) => part.isWordLike ).length : ( text.match( /[\p{L}\p{N}]+/gu ) || [] ).length;
}

export async function fetchMetrics( fetcher: RestFetch, collection: string, id: number, signal: AbortSignal ): Promise< ContentMetrics > {
	const results = await Promise.allSettled( [
		fetcher( `wp/v2/${ collection }/${ id }?context=edit&_fields=content`, { signal } ).then( async ( res ) => {
			if ( ! res.ok ) {
				return null;
			}
			const body = await res.json() as { content?: { rendered?: string; protected?: boolean } };
			return typeof body.content?.rendered === 'string' && ! body.content.protected ? countWords( body.content.rendered ) : null;
		} ),
		fetcher( `wp/v2/comments?post=${ id }&status=approve&per_page=1`, { method: 'HEAD', signal } ).then( ( res ) => {
			const total = res.headers.get( 'X-WP-Total' );
			return res.ok && total !== null && /^\d+$/.test( total ) ? Number( total ) : null;
		} ),
	] );
	return { words: results[ 0 ].status === 'fulfilled' ? results[ 0 ].value : null, comments: results[ 1 ].status === 'fulfilled' ? results[ 1 ].value : null };
}

/** Two cards in flight at most. Closing a window cancels its requests. */
export function createDeskStats( root: HTMLElement, fetcher: RestFetch, collection: 'posts' | 'pages' ): { sync(): void; dispose(): void } {
	const controller = new AbortController();
	const cache = new Map< string, ContentMetrics >();
	const pending = new Set< string >();
	const queue = new Map< string, number >();
	const observed = new WeakMap< Element, string >();
	let active = 0;
	const paint = (): void => {
		for ( const host of root.querySelectorAll< HTMLElement >( '[data-content-metrics]' ) ) {
			const metrics = cache.get( host.dataset.contentMetrics || '' );
			if ( ! metrics ) {
				continue;
			}
			for ( const key of [ 'words', 'comments' ] as const ) {
				host.querySelector( `[data-metric="${ key }"]` )?.setAttribute( 'value', metrics[ key ] === null ? '—' : metrics[ key ]!.toLocaleString() );
			}
		}
	};
	const pump = (): void => {
		if ( controller.signal.aborted ) {
			return;
		}
		while ( active < 2 && queue.size ) {
			const [ key, id ] = queue.entries().next().value!;
			queue.delete( key );
			active++;
			void fetchMetrics( fetcher, collection, id, controller.signal ).then( ( result ) => {
				if ( ! controller.signal.aborted ) {
					cache.set( key, result ); paint();
				}
			} ).finally( () => {
				active--; pump();
			} );
		}
	};
	const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver( ( entries ) => {
		for ( const entry of entries ) {
			if ( ! entry.isIntersecting ) {
				continue;
			}
			const node = entry.target as HTMLElement;
			const key = node.dataset.contentMetrics || '';
			if ( ! pending.has( key ) ) {
				pending.add( key ); queue.set( key, Number( node.dataset.postId ) );
			}
			observer?.unobserve( node );
		}
		pump();
	}, { root: root.querySelector( '.os-posts-desk__feed' ), rootMargin: '80px' } );
	return {
		sync: () => {
			paint();
			root.querySelectorAll( '[data-content-metrics]' ).forEach( ( node ) => {
				const key = node.getAttribute( 'data-content-metrics' ) || '';
				if ( observed.get( node ) !== key ) {
					observed.set( node, key ); observer?.observe( node );
				}
			} );
		},
		dispose: () => {
			controller.abort(); observer?.disconnect(); queue.clear(); cache.clear();
		},
	};
}
