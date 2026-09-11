/** Short, retry-safe requests keep slow AI research outside the browser's HTTP request. */
import { __ } from '../i18n';
import { agentRequestId } from '../agents-jobs';

interface Transport {
	endpoint: string;
	fetch: ( url: string, init?: RequestInit, options?: { silent?: boolean } ) => Promise< Response >;
}

class ProposalRequestError extends Error {
	constructor( message: string, readonly retryable: boolean ) {
		super( message );
	}
}

/** Also supports WordPress installations using the rest_route query parameter. */
export function proposalStatusUrl( endpoint: string, id: string ): string {
	const url = new URL( endpoint, location.href );
	const route = url.searchParams.get( 'rest_route' );
	if ( route ) {
		url.searchParams.set( 'rest_route', route.replace( /\/propose\/?$/, `/jobs/${ id }` ) );
	} else {
		url.pathname = url.pathname.replace( /\/propose\/?$/, `/jobs/${ id }` );
	}
	return url.href;
}

async function request( transport: Transport, url: string, signal: AbortSignal, input?: object ) {
	const controller = new AbortController();
	const abort = () => controller.abort();
	if ( signal.aborted ) {
		throw new DOMException( 'Aborted', 'AbortError' );
	}
	signal.addEventListener( 'abort', abort, { once: true } );
	// eslint-disable-next-line @wordpress/no-unused-vars-before-return
	const timeout = window.setTimeout( abort, 15000 );
	try {
		const response = await transport.fetch( url, {
			method: input ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' },
			body: input ? JSON.stringify( input ) : undefined, signal: controller.signal, cache: 'no-store',
		}, { silent: ! input } );
		const data = await response.json().catch( () => null );
		if ( ! response.ok || ! data || typeof data !== 'object' ) {
			const fallback = response.status === 401 || response.status === 403
				? __( 'Your session could not be verified. Reload OpenStation and try again.' )
				: __( 'The server could not return the branding proposal. Please try again; your site branding has not changed.' );
			throw new ProposalRequestError( typeof data?.message === 'string' ? data.message : fallback,
				! data?.code && ( response.status >= 500 || response.status === 408 || response.ok ) );
		}
		return data;
	} finally {
		window.clearTimeout( timeout );
		signal.removeEventListener( 'abort', abort );
	}
}

function delay( signal: AbortSignal, ms: number ): Promise< void > {
	return new Promise( ( resolve, reject ) => {
		const abort = () => {
			window.clearTimeout( timer );
			signal.removeEventListener( 'abort', abort );
			reject( new DOMException( 'Aborted', 'AbortError' ) );
		};
		const timer = window.setTimeout( () => {
			signal.removeEventListener( 'abort', abort );
			resolve();
		}, ms );
		signal.addEventListener( 'abort', abort, { once: true } );
		if ( signal.aborted ) {
			abort();
		}
	} );
}

/** Retry transport failures with the same UUID; never submit the paid work twice. */
export async function runBrandProposal( transport: Transport, brief: string, signal: AbortSignal ): Promise< unknown > {
	const id = agentRequestId();
	const { endpoint } = transport;
	const deadline = Date.now() + 10 * 60 * 1000;
	let submitted = false;
	let failures = 0;
	while ( Date.now() < deadline ) {
		try {
			const data = await request( transport, submitted ? proposalStatusUrl( endpoint, id ) : endpoint, signal,
				submitted ? undefined : { brief, async: true, requestId: id } );
			// Compatibility with an already-open window during a rolling upgrade.
			if ( ! data.jobId ) {
				return data;
			}
			if ( data.jobId !== id ) {
				throw new ProposalRequestError( __( 'The server returned a different proposal request.' ), false );
			}
			submitted = true;
			if ( data.status === 'completed' ) {
				return data.result;
			}
			if ( data.status === 'failed' ) {
				throw new ProposalRequestError( data.error?.message || __( 'The assistant could not create a proposal.' ), false );
			}
			if ( data.status !== 'queued' && data.status !== 'running' ) {
				throw new ProposalRequestError( __( 'The server returned an invalid proposal status.' ), false );
			}
			failures = 0;
		} catch ( error ) {
			if ( signal.aborted || ( error instanceof ProposalRequestError && ! error.retryable ) ) {
				throw error;
			}
			if ( ++failures >= 3 ) {
				throw new Error( __( 'The server connection was interrupted. Your site branding has not changed. Please try again shortly.' ) );
			}
		}
		await delay( signal, document.hidden ? 10000 : 3000 );
	}
	throw new Error( __( 'The branding proposal took too long. Your site branding has not changed. Please try again.' ) );
}
