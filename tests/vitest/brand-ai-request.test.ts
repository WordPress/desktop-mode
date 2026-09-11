import { afterEach, expect, test, vi } from 'vitest';
import { proposalStatusUrl, runBrandProposal } from '../../src/desktop-themes/brand-ai-request';
import { appExtra } from './helpers/os-settings-app';

const id = '11111111-1111-4111-8111-111111111111';
vi.mock( '../../src/agents-jobs', () => ({ agentRequestId: () => '11111111-1111-4111-8111-111111111111' }) );
afterEach( () => vi.useRealTimers() );
const response = ( data: unknown, status = 200 ) => ({ ok: status < 400, status, json: async () => data });
const job = ( status: string, result: unknown = null ) => response( { jobId: id, status, result } );
const context = ( fetch: ReturnType<typeof vi.fn> ) => ({ fetch, endpoint: appExtra().brandProposalUrl });

test( 'submits a short request, polls sequentially, and returns the completed proposal', async () => {
	vi.useFakeTimers();
	const fetch = vi.fn().mockResolvedValueOnce( job( 'queued' ) ).mockResolvedValueOnce( job( 'running' ) ).mockResolvedValueOnce( job( 'completed', { name: 'Ocean' } ) );
	const result = runBrandProposal( context( fetch ), 'Ocean brand', new AbortController().signal );
	await vi.advanceTimersByTimeAsync( 0 );
	expect( fetch ).toHaveBeenCalledTimes( 1 );
	expect( JSON.parse( fetch.mock.calls[0][1].body ) ).toEqual( { async: true, brief: 'Ocean brand', requestId: id } );
	await vi.advanceTimersByTimeAsync( 6000 );
	expect( await result ).toEqual( { name: 'Ocean' } );
	expect( fetch.mock.calls[1][0] ).toBe( `https://example.test/wp-json/desktop-mode/v1/brand-studio/jobs/${ id }` );
	expect( fetch.mock.calls[1][1].method ).toBe( 'GET' );
	expect( fetch ).toHaveBeenCalledTimes( 3 );
} );

test( 'an HTML gateway error retries the same logical job and never exposes JSON syntax errors', async () => {
	vi.useFakeTimers();
	const fetch = vi.fn().mockResolvedValue( { ok: false, status: 504, json: async () => { throw new SyntaxError( "Unexpected token '<'" ); } } );
	const result = runBrandProposal( context( fetch ), 'Ocean brand', new AbortController().signal ).catch( error => error );
	await vi.advanceTimersByTimeAsync( 6000 );
	expect( (await result).message ).toContain( 'Your site branding has not changed' );
	expect( (await result).message ).not.toContain( 'Unexpected token' );
	expect( fetch ).toHaveBeenCalledTimes( 3 );
	expect( new Set( fetch.mock.calls.map( call => JSON.parse( call[1].body ).requestId ) ).size ).toBe( 1 );
} );

test( 'cancelling stops scheduled status requests', async () => {
	vi.useFakeTimers();
	const fetch = vi.fn().mockResolvedValue( job( 'queued' ) );
	const controller = new AbortController();
	const result = runBrandProposal( context( fetch ), 'Ocean brand', controller.signal ).catch( error => error );
	await vi.advanceTimersByTimeAsync( 0 );
	controller.abort();
	await vi.advanceTimersByTimeAsync( 9000 );
	expect( (await result).name ).toBe( 'AbortError' );
	expect( fetch ).toHaveBeenCalledTimes( 1 );
} );

test( 'provider failures are shown without resubmitting the job', async () => {
	const fetch = vi.fn().mockResolvedValue( response( { jobId: id, status: 'failed', error: { message: 'Provider unavailable.' } } ) );
	await expect( runBrandProposal( context( fetch ), 'Ocean brand', new AbortController().signal ) ).rejects.toThrow( 'Provider unavailable.' );
	expect( fetch ).toHaveBeenCalledOnce();
} );

test( 'status URLs retain plain permalink routing', () => {
	const url = new URL( proposalStatusUrl( 'https://example.test/?rest_route=/desktop-mode/v1/brand-studio/propose', id ) );
	expect( url.searchParams.get( 'rest_route' ) ).toBe( `/desktop-mode/v1/brand-studio/jobs/${ id }` );
} );
