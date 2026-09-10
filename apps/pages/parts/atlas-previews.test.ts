import { describe, expect, it } from 'vitest';
import { selectPreviews } from './atlas-previews';
describe( 'stable Atlas preview residency', () => {
	it( 'keeps visible documents mounted when distance ordering changes', () => {
		expect( selectPreviews( [ 7, 8, 6, 5, 4, 3, 2, 1 ], [ 1, 2, 3, 4, 5, 6 ], null, .6 ) ).toEqual( [ 1, 2, 3, 4, 5, 6 ] );
	} );
	it( 'fills offscreen vacancies and gives explicit selection priority within the six-document budget', () => {
		expect( selectPreviews( [ 7, 6, 5, 4, 3, 2 ], [ 1, 2, 3, 4, 5, 6 ], null, .6 ) ).toEqual( [ 2, 3, 4, 5, 6, 7 ] );
		expect( selectPreviews( [ 7, 6, 5, 4, 3, 2, 1 ], [ 1, 2, 3, 4, 5, 6 ], 7, .6 ) ).toEqual( [ 7, 1, 2, 3, 4, 5 ] );
	} );
	it( 'uses separate entry and exit zoom thresholds to prevent reload churn', () => {
		expect( selectPreviews( [ 1, 2 ], [], null, .35 ) ).toEqual( [] );
		expect( selectPreviews( [ 1, 2 ], [], null, .49 ) ).toEqual( [] );
		expect( selectPreviews( [ 1, 2 ], [ 1 ], null, .45 ) ).toEqual( [ 1 ] );
		expect( selectPreviews( [ 1, 2 ], [ 1 ], null, .39 ) ).toEqual( [] );
	} );
} );
