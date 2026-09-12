import colorVectors from '../fixtures/brand-studio-colors.json';
import { afterEach, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import recipe from '../../assets/desktop-themes/brand-studio/palette.json';
import { BRAND_DEFAULTS, BRAND_ROLES, BRAND_THEME_SLUG, brandColors, compileBrandPalette, contrastRatio, sanitizeBrandPalette, sanitizeBrandFont, sanitizeBrandOpacity, compositeColor, mixColor } from '../../src/desktop-themes/brand-palette';
import { applyBrandPalette } from '../../src/desktop-themes/brand-apply';
import { loadState, PRESENTATION_KEYS, sanitizeSettings } from '../../src/settings/state';
import { DEFAULTS, STORAGE_KEY } from '../../src/settings/constants';

const root = resolve( __dirname, '../..' );
afterEach( () => { document.head.innerHTML = ''; localStorage.clear(); } );

describe( 'Brand Studio colour compiler', () => {
	test.each( colorVectors )( 'matches the PHP colour vectors for $palette', ( { palette, expected, opacity } ) => {
		expect( compileBrandPalette( palette, true, 'geist', opacity ) ).toMatchObject( expected );
	} );
	test( 'wallpaper ink does not follow window text over unrelated artwork', () => {
		const palette = { surface: '#ffffff', canvas: '#ffffff', text: '#222222' };
		expect( compileBrandPalette( palette )[ '--os-brand-desktop-ink' ] ).toBe( '#ffffff' );
		expect( contrastRatio( compileBrandPalette( palette, true )[ '--os-brand-desktop-ink' ], '#ffffff' ) ).toBeGreaterThanOrEqual( 4.5 );
	} );
	test( 'all ten independent roles affect the palette', () => {
		expect( BRAND_ROLES ).toHaveLength( 10 );
		const original = compileBrandPalette( BRAND_DEFAULTS );
		for ( const role of BRAND_ROLES ) {
			expect( compileBrandPalette( { ...BRAND_DEFAULTS, [ role ]: '#123456' } ) ).not.toEqual( original );
		}
	} );

	test( 'every coloured palette token is mapped or explicitly documented as fixed', () => {
		const css = readFileSync( resolve( root, 'assets/css/variables.css' ), 'utf8' );
		const block = css.slice( css.indexOf( 'body.os-active {' ) ).split( '\n}' )[ 0 ].replace( /\/\*[\s\S]*?\*\//g, '' );
		for ( const [ , name, value ] of block.matchAll( /(--[\w-]+):\s*([^;]+);/g ) ) {
			if ( /#|rgba?\(|hsla?\(|var\(/.test( value ) && ! /font|label-color/.test( name ) ) {
				expect( name in recipe.tokens || name in recipe.fixed, name ).toBe( true );
			}
		}
	} );

	test( 'all recipes resolve within the PHP token grammar and size limit', () => {
		const compiled = compileBrandPalette( { primary: '#ffffff', surface: '#ffffff', text: '#ffffff' } );
		expect( Object.keys( compiled ) ).toHaveLength( 336 );
		for ( const [ key, value ] of Object.entries( compiled ) ) {
			expect( value, key ).not.toMatch( /undefined|NaN|[{};]|var\(|url\(/ );
			expect( value.length, key ).toBeLessThanOrEqual( 256 );
		}
	} );

	test.each( [ '#000000', '#ffffff', '#777777', '#e41e2b', '#00ff00', '#0000ff' ] )( 'protects text on %s, including elevated surfaces', ( surface ) => {
		const colors = brandColors( { ...BRAND_DEFAULTS, surface, canvas: surface, text: surface, primary: surface } );
		for ( const fg of [ 'ink', 'muted', 'link', 'successText', 'warningText', 'dangerText', 'infoText' ] ) {
			expect( contrastRatio( colors[ fg ], colors.elevated ), fg ).toBeGreaterThanOrEqual( 4.5 );
		}
		expect( contrastRatio( colors.ink, surface ) ).toBeGreaterThanOrEqual( 4.5 );
		expect( contrastRatio( colors.accentInk, surface ) ).toBeGreaterThanOrEqual( 4.5 );
		expect( contrastRatio( colors.canvasInk, surface ) ).toBeGreaterThanOrEqual( 4.5 );
	} );

	test( 'keeps primary exact and semantic colour families independent', () => {
		const a = compileBrandPalette( { primary: '#ee0000' } );
		const b = compileBrandPalette( { primary: '#00aa55' } );
		expect( a[ '--os-ui-accent' ] ).toBe( '#ee0000' );
		expect( a[ '--os-ui-notice-success-bg' ] ).toBe( b[ '--os-ui-notice-success-bg' ] );
		expect( a[ '--os-ui-holo-fill' ] ).not.toBe( b[ '--os-ui-holo-fill' ] );
		expect( a[ '--os-ui-hover' ] ).not.toBe( a[ '--os-ui-button-bg-hover' ] );
	} );

	test( 'invalid input never becomes CSS, and missing roles preserve the patch fallback', () => {
		const fallback = { ...BRAND_DEFAULTS, primary: '#123456' };
		const p = sanitizeBrandPalette( { primary: 'red; color:red', text: '#ABCDEF', extra: '#ffffff' }, fallback );
		expect( p.primary ).toBe( '#123456' );
		expect( p.text ).toBe( '#abcdef' );
		expect( Object.keys( p ) ).toHaveLength( 10 );
		for ( const raw of [ null, [], 5, 'red' ] ) {
			expect( sanitizeBrandPalette( raw ) ).toEqual( BRAND_DEFAULTS );
		}
	} );
} );

describe( 'Brand Studio live state', () => {
	test( 'persists through settings, reload and sanitization', () => {
		const state = { ...DEFAULTS, desktopTheme: BRAND_THEME_SLUG, brandPalette: { ...BRAND_DEFAULTS, primary: '#123456' } };
		localStorage.setItem( STORAGE_KEY, JSON.stringify( state ) );
		expect( loadState().brandPalette ).toEqual( state.brandPalette );
		expect( sanitizeSettings( { brandPalette: { primary: '#abcdef' } } as never, state ).brandPalette.surface ).toBe( state.brandPalette.surface );
		expect( PRESENTATION_KEYS.has( 'brandPalette' ) ).toBe( true );
	} );

	test( 'live edits replace one scoped layer, rollback restores it, switching removes it', () => {
		applyBrandPalette( BRAND_THEME_SLUG, BRAND_DEFAULTS );
		const style = document.getElementById( 'os-brand-studio-live' )!;
		const original = style.textContent;
		applyBrandPalette( BRAND_THEME_SLUG, { primary: '#123456' } );
		expect( document.querySelectorAll( '#os-brand-studio-live' ) ).toHaveLength( 1 );
		expect( style.textContent ).toContain( '--os-ui-accent:#123456 !important' );
		expect( style.textContent ).toContain( 'body.os-active.os-desktop-theme-' );
		expect( style.textContent ).not.toContain( ':root' );
		applyBrandPalette( BRAND_THEME_SLUG, BRAND_DEFAULTS );
		expect( style.textContent ).toBe( original );
		applyBrandPalette( 'desktop-mode-legacy', BRAND_DEFAULTS );
		expect( document.getElementById( 'os-brand-studio-live' ) ).toBeNull();
	} );
} );


test( 'font stacks are allowlisted and reach all interface typography tokens live', () => {
	for ( const font of Object.keys( recipe.fonts ) ) {
		const tokens = compileBrandPalette( {}, false, font );
		expect( tokens[ '--os-font' ] ).toBe( recipe.fonts[ font as keyof typeof recipe.fonts ] );
		expect( tokens[ '--os-ui-font' ] ).toBe( tokens[ '--os-titlebar-font' ] );
		applyBrandPalette( BRAND_THEME_SLUG, {}, undefined, font );
		expect( document.getElementById( 'os-brand-studio-live' )!.textContent ).toContain( tokens[ '--os-font' ] );
	}
	for ( const raw of [ '__proto__', 'url(https://example.com)', {}, null ] ) {
		expect( sanitizeBrandFont( raw ) ).toBe( 'geist' );
	}
	const state = sanitizeSettings( { brandFont: 'editorial' }, DEFAULTS );
	localStorage.setItem( STORAGE_KEY, JSON.stringify( state ) );
	expect( loadState().brandFont ).toBe( 'editorial' );
	expect( PRESENTATION_KEYS.has( 'brandFont' ) ).toBe( true );
} );


test( 'document surfaces stay readable independently of the desktop canvas', () => {
	const p = { ...BRAND_DEFAULTS, surface: '#ffffff', text: '#1e1e1e', canvas: '#101c4b' };
	const tokens = compileBrandPalette( p, true );
	expect( contrastRatio( tokens[ '--os-ui-fg' ], tokens[ '--os-ui-surface-sunken' ] ) ).toBeGreaterThanOrEqual( 4.5 );
	expect( tokens[ '--os-ui-surface-sunken' ] ).not.toBe( p.canvas );
	expect( tokens[ '--os-cn-row-ink' ] ).toBe( tokens[ '--os-ui-holo-ink' ] );
} );

test( 'wallpaper tiles use canvas ink while the assistant notch has an opaque readable surface', () => {
	const css = readFileSync( resolve( root, 'assets/css/variables.css' ), 'utf8' );
	expect( css ).toContain( '#os-area > .os-files-layer' );
	for ( const canvas of [ '#101c4b', '#ffffff', '#777777' ] ) {
		for ( const surface of [ '#ffffff', '#1b2435' ] ) {
			const tokens = compileBrandPalette( { ...BRAND_DEFAULTS, canvas, surface }, true );
			expect( contrastRatio( tokens['--os-brand-desktop-ink'], canvas ) ).toBeGreaterThanOrEqual( 4.5 );
			expect( contrastRatio( tokens['--os-ui-fg'], tokens['--os-ui-surface-raised'] ) ).toBeGreaterThanOrEqual( 4.5 );
		}
	}
} );


test( 'alpha colours blend predictably and glass keeps readable ink at zero and partial opacity', () => {
	expect( sanitizeBrandPalette( { primary: '#12345680' } ).primary ).toBe( '#12345680' );
	expect( compositeColor( '#ffffff00', '#123456' ) ).toBe( '#123456' );
	expect( compositeColor( '#ffffff80', '#000000' ) ).toBe( '#808080' );
	for ( const opacity of [ 0, 25, 50, 82, 100 ] ) {
		const colors = brandColors( { surface: '#ffffff80' }, true, { widgets: opacity, dock: opacity } );
		const widgetBackground = mixColor( colors.canvas, colors.surface, opacity / 100 );
		expect( contrastRatio( colors.widgetInk, widgetBackground ) ).toBeGreaterThanOrEqual( 4.5 );
		expect( contrastRatio( colors.widgetMuted, widgetBackground ) ).toBeGreaterThanOrEqual( 4.5 );
		expect( colors.widgetGlass ).toContain( `, ${ opacity / 100 })` );
	}
	const colors = brandColors( {}, true );
	expect( colors.dockGlass ).not.toContain( '16, 28, 75' );
	expect( contrastRatio( colors.dockBorder, colors.canvas ) ).toBeGreaterThan( 3 );
	expect( sanitizeBrandOpacity( { widgets: 0, dock: Infinity, unexpected: 50 } ) ).toEqual( { widgets: 0, dock: 94 } );
	expect( sanitizeBrandOpacity( { widgets: -4, dock: 120 } ) ).toEqual( { widgets: 0, dock: 100 } );
	expect( PRESENTATION_KEYS.has( 'brandOpacity' ) ).toBe( true );
	const state = sanitizeSettings( { brandOpacity: { widgets: 0, dock: 40 } }, DEFAULTS );
	localStorage.setItem( STORAGE_KEY, JSON.stringify( state ) );
	expect( loadState().brandOpacity ).toEqual( { widgets: 0, dock: 40 } );
} );


test( 'widget titles, grips and chrome reuse the widget ink contract across presets', () => {
	const css = readFileSync( resolve( root, 'assets/css/desktop.css' ), 'utf8' );
	const title = css.split( '.os-widgets__title {' )[ 1 ].split( '}' )[ 0 ];
	expect( title ).toContain( 'var( --os-ui-color-text,' );
	expect( title ).toContain( 'min-inline-size: 0' );
	const grip = css.split( '.os-widgets__grip {' )[ 1 ].split( '}' )[ 0 ];
	expect( grip ).toContain( 'var( --os-ui-color-text-subtle,' );
	const date = css.split( '.os-widget-clock__date {' )[ 1 ].split( '}' )[ 0 ];
	expect( date ).toContain( 'var( --os-ui-color-text-subtle,' );
	for ( const palette of [ {}, { canvas: '#eee9e5', surface: '#ffffff', text: '#242021' }, { canvas: '#e7eee9', surface: '#fcfdf9', text: '#17372e' }, { canvas: '#101622', surface: '#1b2435', text: '#edf2ff' } ] ) {
		for ( const widgets of [ 0, 25, 50, 82, 100 ] ) {
			const colors = brandColors( palette, true, { widgets } );
			const tokens = compileBrandPalette( palette, true, 'geist', { widgets } );
			expect( tokens[ '--os-ui-color-text' ] ).toBe( colors.widgetInk );
			for ( const backdrop of [ colors.canvas, colors.canvasDepth ] ) {
				expect( contrastRatio( colors.widgetInk, mixColor( backdrop, colors.surface, widgets / 100 ) ) ).toBeGreaterThanOrEqual( 4.5 );
			}
		}
	}
} );


test( 'toast text, action states and selected text retain contrast for opaque and alpha roles', () => {
	for ( const surface of [ '#ffffff', '#1b2435', '#777777', '#ffffff80' ] ) {
		for ( const primary of [ '#3858e9', '#000000', '#ffffff', '#f0ee00', '#3858e940' ] ) {
			const tokens = compileBrandPalette( { surface, primary } );
			for ( const background of [ '--os-ui-modal-bg', '--os-ui-modal-field-bg', '--os-ui-modal-button-bg-hover' ] ) {
				expect( contrastRatio( tokens[ '--os-ui-modal-text' ], tokens[ background ] ) ).toBeGreaterThanOrEqual( 4.5 );
			}
			expect( contrastRatio( tokens[ '--os-ui-selection-fg' ], tokens[ '--os-ui-selection-bg' ] ) ).toBeGreaterThanOrEqual( 4.5 );
			expect( tokens[ '--os-ui-modal-button-bg-hover' ] ).not.toBe( tokens[ '--os-ui-modal-field-bg' ] );
		}
	}
} );


test( 'loader mark contrasts with the brand disc instead of borrowing window ink', () => {
	for ( const primary of [ '#3858e9', '#ffffff', '#000000', '#ffcc00', '#3858e940' ] ) {
		const tokens = compileBrandPalette( { primary } );
		expect( contrastRatio( tokens[ '--os-ui-spinner-accent' ], tokens[ '--os-ui-spinner-color' ] ) ).toBeGreaterThanOrEqual( 4.5 );
	}
	expect( compileBrandPalette( {} )[ '--os-ui-spinner-accent' ] ).toBe( '#ffffff' );
} );
