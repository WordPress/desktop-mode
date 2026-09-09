import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCanvasChrome } from './chrome';
import { directoryTerms, mountTermDirectory } from './directory';
import type { TermRow } from '../types';

const term = ( id: number, name: string, count = 0 ): TermRow => ( { id, name, count, parent: 0, slug: name, description: '', isDefault: false } );
afterEach( () => document.body.replaceChildren() );

describe( 'topic directory', () => {
	it( 'searches decoded names, sorts alphabetically, and identifies unused topics', () => {
		const terms = [ term( 1, 'Zebra', 3 ), term( 2, 'Arts &amp; crafts' ), term( 3, 'Book' ) ];
		expect( directoryTerms( terms, 'ARTS &', false ).map( ( t ) => t.id ) ).toEqual( [ 2 ] );
		expect( directoryTerms( terms, '', true ).map( ( t ) => t.id ) ).toEqual( [ 2, 3 ] );
	} );

	it( 'browses live topics, opens the existing canvas focus, and cleans up', async () => {
		const host = document.createElement( 'div' );
		document.body.appendChild( host );
		const chrome = buildCanvasChrome( host, 'os-tagcloud', { buttons: [], searchPlaceholder: '', searchAria: '', hint: '' } );
		let terms = [ term( 1, 'First' ) ];
		const select = vi.fn();
		const stop = mountTermDirectory( chrome, () => terms, select );
		( host.querySelector( '.os-term-directory__toggle' ) as HTMLElement ).click();
		await Promise.resolve();
		expect( host.querySelector( '.os-term-directory' )?.hasAttribute( 'hidden' ) ).toBe( false );
		( host.querySelector( '[data-topic-id="1"]' ) as HTMLElement ).click();
		expect( select ).toHaveBeenCalledWith( 1 );
		expect( host.querySelector( '.os-term-directory' )?.hasAttribute( 'hidden' ) ).toBe( true );
		terms = [ term( 2, 'Second' ) ];
		( host.querySelector( '.os-term-directory__toggle' ) as HTMLElement ).click();
		expect( host.querySelector( '[data-topic-id="1"]' ) ).toBeNull();
		expect( host.querySelector( '[data-topic-id="2"]' ) ).not.toBeNull();
		stop();
		expect( host.querySelector( '.os-term-directory' ) ).toBeNull();
		expect( host.querySelector( '.os-term-directory__toggle' ) ).toBeNull();
	} );

	it( 'filters from real kit events and shows a recoverable empty state', () => {
		const host = document.createElement( 'div' );
		document.body.appendChild( host );
		const chrome = buildCanvasChrome( host, 'os-mindmap', { buttons: [], searchPlaceholder: '', searchAria: '', hint: '' } );
		const stop = mountTermDirectory( chrome, () => [ term( 1, 'Used', 2 ), term( 2, 'Empty' ) ], vi.fn() );
		( host.querySelector( '.os-term-directory__toggle' ) as HTMLElement ).click();
		host.querySelector( '.os-term-directory os-select' )!.dispatchEvent( new CustomEvent( 'os-pick', { detail: { value: 'unused' } } ) );
		expect( host.querySelectorAll( '[data-topic-id]' ) ).toHaveLength( 1 );
		host.querySelector( '.os-term-directory os-text-field' )!.dispatchEvent( new CustomEvent( 'os-input-change', { detail: { value: 'missing' } } ) );
		expect( host.querySelectorAll( '[data-topic-id]' ) ).toHaveLength( 0 );
		expect( host.textContent ).toContain( 'No matching topics.' );
		stop();
	} );
} );
