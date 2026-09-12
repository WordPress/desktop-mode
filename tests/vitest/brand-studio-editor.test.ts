import { afterEach, expect, test, vi } from 'vitest';
import { render } from '../../src/ui/core';
import '../../src/ui/components/os-color-picker/os-color-picker';
import { renderBrandStudio } from '../../apps/os-settings/parts/brand-studio';
import { freshUi, type Ctx } from '../../apps/os-settings/parts/types';
import { DEFAULTS } from '../../src/settings/constants';
import { BRAND_DEFAULTS, BRAND_THEME_SLUG } from '../../src/desktop-themes/brand-palette';
import type { OsSettingsState } from '../../src/settings/types';

const bridge = vi.hoisted( () => ({ settings: vi.fn(), update: vi.fn() }) );
vi.mock( '../../apps/os-settings/parts/store', () => bridge );
afterEach( () => { document.body.innerHTML = ''; vi.clearAllMocks(); } );

function mount() {
	let state: OsSettingsState = { ...DEFAULTS, desktopTheme: BRAND_THEME_SLUG, wallpaper: 'brand-studio', brandPalette: { ...BRAND_DEFAULTS } };
	const root = document.createElement( 'div' );
	document.body.append( root );
	const ui = freshUi();
	const ctx = { root, data: { isAdmin: true }, ui: () => ui, repaint: () => render( renderBrandStudio( state, ctx ), root ) } as unknown as Ctx;
	bridge.settings.mockImplementation( () => structuredClone( state ) );
	bridge.update.mockImplementation( ( patch ) => { state = { ...state, ...patch }; ctx.repaint(); } );
	ctx.repaint();
	return { root, ctx, read: () => state };
}

const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

test( 'only this theme exposes the editor, with ten uniquely labelled controls', async () => {
	const { root, ctx } = mount();
	await tick();
	const fields = [ ...root.querySelectorAll( 'os-color-picker' ) ];
	expect( fields ).toHaveLength( 10 );
	expect( new Set( fields.map( ( f ) => f.id ) ).size ).toBe( 10 );
	expect( [ ...root.querySelectorAll( 'os-section' ) ].slice( 0, 3 ).map( section => section.getAttribute( 'heading' ) ) ).toEqual( [ 'Brand', 'Accents', 'Status colours' ] );
	expect( fields.slice( 0, 6 ).map( field => field.getAttribute( 'label' ) ) ).toEqual( [ 'Canvas', 'Surfaces', 'Text', 'Primary', 'Secondary', 'Highlight' ] );
	render( renderBrandStudio( DEFAULTS, ctx ), root );
	expect( root.querySelector( '.os-settings__brand-studio' ) ).toBeNull();
} );

test( 'picker input updates without waiting for change/blur and preserves the active control', async () => {
	const { root, read } = mount();
	await tick();
	const field = root.querySelector( '#os-settings-brand-primary' )!;
	const input = field.shadowRoot!.querySelector( 'input[type=text]' )!;
	input.value = '#0057b8';
	input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	await tick();
	expect( read().brandPalette.primary ).toBe( '#0057b8' );
	expect( read().brandPalette.danger ).toBe( BRAND_DEFAULTS.danger );
	expect( root.querySelector( '#os-settings-brand-primary' ) ).toBe( field );
	expect( field.shadowRoot!.querySelector( 'input[type=text]' ) ).toBe( input );
} );

test( 'invalid hex is a draft, a valid edit saves, and Undo reverses a whole preset', async () => {
	const { root, read } = mount();
	await tick();
	const field = root.querySelector( '#os-settings-brand-primary' )!;
	const input = field.shadowRoot!.querySelector<HTMLInputElement>( 'input[type=text]' )!;
	input.value = '#oops';
	input.dispatchEvent( new Event( 'input' ) );
	await tick();
	expect( bridge.update ).not.toHaveBeenCalled();
	expect( input.getAttribute( 'aria-invalid' ) ).toBe( 'true' );
	input.value = '#0057b8';
	input.dispatchEvent( new Event( 'input' ) );
	expect( read().brandPalette.primary ).toBe( '#0057b8' );
	const buttons = () => [ ...root.querySelectorAll( 'os-button' ) ];
	buttons().find( ( b ) => b.textContent?.trim() === 'Paper & red' )!.dispatchEvent( new MouseEvent( 'click' ) );
	expect( read().brandPalette.surface ).toBe( '#ffffff' );
	expect( read().wallpaper ).toBe( 'brand-studio' );
	buttons().find( ( b ) => b.textContent?.trim() === 'Undo last change' )!.dispatchEvent( new MouseEvent( 'click' ) );
	expect( read().brandPalette.primary ).toBe( '#0057b8' );
	expect( read().brandPalette.surface ).toBe( BRAND_DEFAULTS.surface );
	expect( read().wallpaper ).toBe( 'brand-studio' );
} );


test( 'font changes live and can be undone without altering the palette', () => {
	const { root, read } = mount();
	root.querySelector( 'os-select' )!.dispatchEvent( new CustomEvent( 'os-pick', { detail: { value: 'editorial' } } ) );
	expect( read().brandFont ).toBe( 'editorial' );
	expect( read().brandPalette ).toEqual( BRAND_DEFAULTS );
	[ ...root.querySelectorAll( 'os-button' ) ].find( ( b ) => b.textContent?.trim() === 'Undo last change' )!.dispatchEvent( new MouseEvent( 'click' ) );
	expect( read().brandFont ).toBe( DEFAULTS.brandFont );
} );

test( 'wallpaper permission is enabled by default and changes independently of the palette', () => {
	const { root, read } = mount();
	const control = root.querySelector( 'os-checkbox-label[label="Allow users to choose their own wallpaper"]' )!;
	expect( control.hasAttribute( 'checked' ) ).toBe( true );
	control.dispatchEvent( new CustomEvent( 'os-checkbox-change', { detail: { checked: false } } ) );
	expect( read().brandAllowWallpaper ).toBe( false );
	expect( read().brandPalette ).toEqual( BRAND_DEFAULTS );
} );

test( 'every starting palette applies its matching wallpaper and keeps the chosen font', () => {
	const { root, read } = mount();
	bridge.update( { brandFont: 'editorial' } );
	for ( const button of root.querySelectorAll( '[aria-label="Starting palettes"] os-button[data-brand-preset]' ) ) {
		bridge.update( { wallpaper: 'galaxy' } );
		button.dispatchEvent( new MouseEvent( 'click' ) );
		expect( read().wallpaper ).toBe( 'brand-studio' );
		expect( read().brandFont ).toBe( 'editorial' );
	}
	expect( root.textContent ).toContain( 'WordPress' );
	expect( root.textContent ).not.toContain( 'Cola' );
} );

test( 'non-admins do not receive the palette editor', () => {
	const { root, ctx, read } = mount();
	ctx.data.isAdmin = false;
	render( renderBrandStudio( read(), ctx ), root );
	expect( root.querySelector( 'os-color-picker' ) ).toBeNull();
	expect( root.querySelector( 'os-select' ) ).toBeNull();
} );


test( 'glass changes save separately from the ten colours and Undo restores opacity', () => {
	const { root, read } = mount();
	const field = root.querySelector( 'os-range-field[label="Widget opacity"]' )!;
	field.dispatchEvent( new FocusEvent( 'focusin', { bubbles: true } ) );
	field.dispatchEvent( new CustomEvent( 'os-range-change', { detail: { value: 0 } } ) );
	expect( read().brandOpacity.widgets ).toBe( 0 );
	expect( read().brandPalette ).toEqual( BRAND_DEFAULTS );
	[ ...root.querySelectorAll( 'os-button' ) ].find( ( b ) => b.textContent?.trim() === 'Undo last change' )!.dispatchEvent( new MouseEvent( 'click' ) );
	expect( read().brandOpacity.widgets ).toBe( DEFAULTS.brandOpacity.widgets );
} );
