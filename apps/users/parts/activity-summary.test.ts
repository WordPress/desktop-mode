import { describe, expect, it, vi } from 'vitest';
import { mockViewContext } from '../../../src/app-runtime/testing';
import type { UsersState, UsersData } from './types';
import { ActivitySummary } from './activity-summary';
const snapshot = { total: 500, groups: [ { role: 'editor', label: 'Editor', total: 120, members: [] } ] };
const setup = () => {
	const ctx = mockViewContext< UsersState, UsersData >( { root: document.createElement( 'div' ), state: { tab: 'activity' } as UsersState, data: { list: { items: [], total: 20, pages: 25, page: 1, perPage: 20 } } } );
	ctx.repaint = vi.fn();
	Object.assign( ctx, { fetch: vi.fn( async () => new Response( JSON.stringify( snapshot ) ) ) } );
	return { ctx, summary: new ActivitySummary() };
};
describe( 'complete activity snapshots', () => {
	it( 'uses one request independently of directory pagination and does not refetch on repaint', async () => {
		const { ctx, summary } = setup();
		summary.update( ctx ); summary.update( ctx );
		await vi.waitFor( () => expect( summary.data?.total ).toBe( 500 ) );
		expect( ctx.fetch ).toHaveBeenCalledTimes( 1 );
		expect( ctx.fetch ).toHaveBeenCalledWith( '/desktop-mode/v1/users/activity-summary', expect.objectContaining( { signal: expect.any( AbortSignal ) } ) );
	} );
	it( 'retains the last complete snapshot on a failure and allows retry', async () => {
		const { ctx, summary } = setup(); await summary.load( ctx );
		Object.assign( ctx, { fetch: vi.fn( async () => new Response( '', { status: 403 } ) ) } );
		await summary.load( ctx ); expect( summary.error ).toBe( true ); expect( summary.data?.total ).toBe( 500 );
		Object.assign( ctx, { fetch: vi.fn( async () => new Response( JSON.stringify( snapshot ) ) ) } );
		await summary.load( ctx ); expect( summary.error ).toBe( false );
	} );
	it( 'aborts its request when the window closes', async () => {
		const { ctx, summary } = setup();
		let signal: AbortSignal | undefined;
		Object.assign( ctx, { fetch: vi.fn( async ( _url, init ) => {
			signal = init.signal; return new Response( JSON.stringify( snapshot ) );
		} ) } );
		const pending = summary.load( ctx ); summary.dispose(); await pending;
		expect( signal?.aborted ).toBe( true ); expect( summary.data ).toBeNull();
	} );
} );
