import { describe, expect, it } from 'vitest';
import { activityModel, contributors, registeredAt } from './activity-model';
import type { UserListItem } from './types';
const now = Date.parse( '2026-09-09T12:00:00Z' );
const row = ( id: number, over: Partial< UserListItem > = {} ): UserListItem => ( { id, name: `Person ${ id }`, slug: `person${ id }`, roles: [], ...over } );
describe( 'community activity facts', () => {
	it( 'keeps missing statistics distinct from real zeroes and counts comment-only contributors', () => {
		const model = activityModel( [ row( 1 ), row( 2, { openstation_user_stats: { posts: 0, pages: 0, comments: 0 } } ), row( 3, { openstation_user_stats: { posts: 0, pages: 0, comments: 70 } } ) ], now );
		expect( model.known ).toBe( 2 );
		expect( model.contributors ).toBe( 1 );
		expect( model.totals ).toEqual( { posts: 0, pages: 0, comments: 70 } );
		expect( model.unknownPresence ).toBe( 3 );
	} );
	it( 'ranks by the selected contribution without changing the source rows', () => {
		const rows = [ row( 1, { openstation_user_stats: { posts: 5, pages: 0, comments: 0 } } ), row( 2, { openstation_user_stats: { posts: 0, pages: 3, comments: 70 } } ) ];
		expect( contributors( rows, 'comments' ).map( ( p ) => p.id ) ).toEqual( [ 2 ] );
		expect( contributors( rows, 'posts' ).map( ( p ) => p.id ) ).toEqual( [ 1 ] );
		expect( contributors( rows, 'pages' ).map( ( p ) => p.id ) ).toEqual( [ 2 ] );
		expect( rows.map( ( p ) => p.id ) ).toEqual( [ 1, 2 ] );
	} );
	it( 'counts eight non-overlapping UTC weeks, excluding invalid, old and future dates', () => {
		const boundary = activityModel( [], now );
		const dates = [ new Date( boundary.start * 1000 ).toISOString(), '2026-09-09T08:00:00', '2026-09-10T00:00:00Z', 'not a date', '2025-01-01T00:00:00Z' ];
		const rows = dates.map( ( date, index ) => row( index, { registered_date: date } ) );
		const model = activityModel( rows, now );
		expect( registeredAt( rows[ 1 ] ) ).toBe( Date.parse( '2026-09-09T08:00:00Z' ) );
		expect( model.weeks ).toHaveLength( 8 );
		expect( model.weeks[ 0 ][ 0 ] ).toBe( 1 );
		expect( model.weeks[ 7 ][ 0 ] ).toBe( 1 );
		expect( model.weeks.flat().reduce( ( a, b ) => a + b, 0 ) ).toBe( 2 );
		expect( model.recent ).toBe( 1 );
		expect( model.registered.map( ( p ) => p.id ) ).toEqual( [ 1, 0, 4 ] );
	} );
	it( 'reports presence separately from latest sign-in and never counts missing or future logins', () => {
		const model = activityModel( [ row( 1, { openstation_presence: 'online' } ), row( 2, { openstation_presence: 'inactive', openstation_last_login: now / 1000 - 60 } ), row( 3, { openstation_presence: 'offline', openstation_last_login: now / 1000 + 60 } ), row( 4, { openstation_last_login: 0 } ) ], now );
		expect( model.online.map( ( p ) => p.id ) ).toEqual( [ 1 ] );
		expect( model.away.map( ( p ) => p.id ) ).toEqual( [ 2 ] );
		expect( model.active30 ).toBe( 1 );
		expect( model.unrecorded ).toBe( 3 );
		expect( model.logins.map( ( p ) => p.id ) ).toEqual( [ 2 ] );
	} );
} );
