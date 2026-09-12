/**
 * Plugins app — single-flight update queue.
 *
 * Mirrors Core's `wp.updates.ajaxLocked` + `wp.updates.queue` semantics
 * (see `wp-admin/js/updates.js`): plugin updates MUST run one at a
 * time. The `update_plugins` site transient is a single mutable
 * snapshot — `Plugin_Upgrader` writes to it on completion, so two
 * concurrent updates can interleave and corrupt each other's view of
 * pending updates. Core enforces this with a global lock and a FIFO
 * queue; this does the same, scoped to the window.
 *
 * A thin Promise wrapper: callers `await enqueueUpdateJob( () =>
 * updateInstalledPlugin( row ) )` and get the result. Cancellation is
 * intentionally NOT supported — once an update is in flight the
 * upgrader is past the point of safe abort.
 *
 * @public
 */

export const DEFAULT_UPDATE_TIMEOUT_MS = 60_000;

interface Job< T > {
	run: () => Promise< T >;
	resolve: ( value: T ) => void;
	reject: ( error: unknown ) => void;
	timeoutMs: number;
}

const queue: Array< Job< unknown > > = [];
let inFlight = false;

/**
 * Enqueue a plugin-update job. The returned Promise resolves /
 * rejects with the result of `run()` once every job ahead of it
 * has settled. Errors are isolated — one failed update does not
 * cancel queued jobs (matches Core's behavior; failed updates leave
 * a `notice-error` on the row and the queue drains the rest).
 *
 * Jobs that fail to settle within `timeoutMs` reject with a timeout error
 * and release the queue lock so subsequent jobs can proceed.
 */
export function enqueueUpdateJob< T >(
	run: () => Promise< T >,
	timeoutMs = DEFAULT_UPDATE_TIMEOUT_MS,
): Promise< T > {
	return new Promise< T >( ( resolve, reject ) => {
		queue.push( {
			run: run as () => Promise< unknown >,
			resolve: resolve as ( v: unknown ) => void,
			reject,
			timeoutMs,
		} );
		void drain();
	} );
}

/** Reset queue state — for unit tests only. */
export function resetUpdateQueueForTest(): void {
	queue.length = 0;
	inFlight = false;
}

async function drain(): Promise< void > {
	if ( inFlight ) {
		return;
	}
	const job = queue.shift();
	if ( ! job ) {
		return;
	}
	inFlight = true;
	let timer: ReturnType< typeof setTimeout > | null = null;
	try {
		const timeoutPromise = new Promise< never >( ( _, reject ) => {
			timer = setTimeout( () => {
				reject( new Error( 'Update request timed out' ) );
			}, job.timeoutMs );
		} );
		const value = await Promise.race( [ job.run(), timeoutPromise ] );
		job.resolve( value );
	} catch ( err ) {
		job.reject( err );
	} finally {
		if ( timer !== null ) {
			clearTimeout( timer );
		}
		inFlight = false;
		// Yield to the microtask queue so the resolver's `.then`
		// handlers run before the next job begins — keeps the "row
		// finishes, next row spinner appears" transition crisp.
		void Promise.resolve().then( drain );
	}
}
