import { afterEach, expect, test, vi } from 'vitest';
import { render } from '../../src/ui/core';
import { renderBrandStudio } from '../../apps/os-settings/parts/brand-studio';
import { readBrandProposal, requestBrandProposal } from '../../apps/os-settings/parts/brand-ai';
import { freshUi, type Ctx } from '../../apps/os-settings/parts/types';
import { appData, appExtra } from './helpers/os-settings-app';
import { DEFAULTS } from '../../src/settings/constants';
import { BRAND_DEFAULTS, BRAND_THEME_SLUG } from '../../src/desktop-themes/brand-palette';

const bridge = vi.hoisted( () => ({ settings: vi.fn(), update: vi.fn() }) );
vi.mock( '../../apps/os-settings/parts/store', () => bridge );
afterEach( () => { document.body.innerHTML = ''; vi.clearAllMocks(); } );
const tick = async () => { for ( let n = 0; n < 8; n++ ) await Promise.resolve(); };
const proposal = () => ({ name: 'Ocean', rationale: 'A blue identity.', brandPalette: { ...BRAND_DEFAULTS, primary: '#0057b8' }, brandFont: 'system', brandOpacity: { widgets: 75, dock: 94 }, sources: [], webSearch: false, warning: 'No live web research.' });
function mount() {
	const current = { ...DEFAULTS, desktopTheme: BRAND_THEME_SLUG };
	const root = document.createElement( 'div' ); document.body.append( root );
	const ui = freshUi();
	const fetch = vi.fn().mockResolvedValue( { ok: true, json: async () => proposal() } );
	const ctx = { root, data: appData( { aiAssistant: { available: true, providerConfigured: true, assistantProviderConfigured: false, enabled: false, connectorsUrl: '/connectors' } } ), extra: appExtra(), ui: () => ui, fetch, repaint: () => render( renderBrandStudio( current, ctx ), root ) } as unknown as Ctx;
	bridge.settings.mockReturnValue( structuredClone( current ) );
	ctx.repaint();
	const click = ( text: string ) => [ ...root.querySelectorAll( 'os-button' ) ].find( el => el.textContent?.trim() === text )!.dispatchEvent( new MouseEvent( 'click' ) );
	click( 'Make it with AI' );
	root.querySelector( 'os-textarea' )!.dispatchEvent( new CustomEvent( 'os-input-change', { detail: { value: 'Use ocean blue branding' } } ) );
	return { root, ui, fetch, click, ctx };
}

test.each( [ null, { available: false, providerConfigured: true }, { available: true, providerConfigured: false } ] )( 'hides the AI entry and open panel without a usable connection: %j', async ( status ) => {
	const { root, ctx, fetch } = mount();
	const connected = ctx.data.aiAssistant;
	ctx.data.aiAssistant = status ? { ...connected!, ...status } : null;
	ctx.repaint();
	expect( root.textContent ).not.toContain( 'Make it with AI' );
	expect( root.querySelector( '.os-settings__brand-ai' ) ).toBeNull();
	await requestBrandProposal( ctx );
	expect( fetch ).not.toHaveBeenCalled();
	ctx.data.aiAssistant = connected;
	ctx.repaint();
	expect( root.textContent ).toContain( 'Make it with AI' );
} );

test( 'generates an isolated preview without writing settings; only Apply saves', async () => {
	const { root, fetch, click } = mount();
	const presets = root.querySelector( '[aria-label="Starting palettes"]' )!;
	expect( presets.lastElementChild?.className ).toBe( 'os-settings__brand-ai-entry' );
	expect( presets.lastElementChild?.querySelector( 'os-button' )?.getAttribute( 'variant' ) ).toBe( 'secondary' );
	click( 'Propose branding' ); await tick();
	expect( fetch ).toHaveBeenCalledOnce();
	expect( bridge.update ).not.toHaveBeenCalled();
	expect( root.querySelector( '[aria-label="Proposed brand preview"]' )?.getAttribute( 'style' ) ).toContain( '--os-ui-accent:#0057b8' );
	expect( root.textContent ).toContain( 'No live web research.' );
	expect( root.textContent ).not.toContain( proposal().rationale );
	const { rationale: _unused, ...withoutSummary } = proposal();
	expect( () => readBrandProposal( withoutSummary ) ).not.toThrow();
	click( 'Apply branding to this site' );
	expect( bridge.update ).toHaveBeenCalledExactlyOnceWith( expect.objectContaining( { brandPalette: proposal().brandPalette, brandOpacity: proposal().brandOpacity, brandFont: 'system', wallpaper: 'brand-studio' } ) );
} );

test( 'Cancel aborts and ignores late responses without changing site branding', async () => {
	const { root, fetch, click } = mount();
	let finish!: (v: unknown) => void;
	fetch.mockReturnValue( new Promise( resolve => { finish = resolve; } ) );
	click( 'Propose branding' ); click( 'Cancel' );
	expect( fetch.mock.calls[0][1].signal.aborted ).toBe( true );
	finish( { ok: true, json: async () => proposal() } ); await tick();
	expect( root.querySelector( '.os-settings__brand-ai' ) ).toBeNull();
	expect( bridge.update ).not.toHaveBeenCalled();
} );

test( 'provider failures keep the brief and allow retry', async () => {
	const { root, fetch, click } = mount();
	fetch.mockResolvedValueOnce( { ok: false, json: async () => ({ message: 'Connect a provider first.' }) } );
	click( 'Propose branding' ); await tick();
	expect( root.textContent ).toContain( 'Connect a provider first.' );
	expect( root.querySelector( 'os-textarea' )!.getAttribute( 'value' ) ).toBe( 'Use ocean blue branding' );
	click( 'Propose branding' ); await tick();
	expect( root.querySelector( '[aria-label="Proposed brand preview"]' ) ).not.toBeNull();
	expect( bridge.update ).not.toHaveBeenCalled();
} );

test( 'rejects invalid values before preview CSS and clears a proposal when its brief changes', async () => {
	expect( () => readBrandProposal( { ...proposal(), brandFont: '__proto__' } ) ).toThrow();
	expect( () => readBrandProposal( { ...proposal(), brandPalette: { ...BRAND_DEFAULTS, primary: 'red;position:fixed' } } ) ).toThrow();
	const { root, click } = mount(); click( 'Propose branding' ); await tick();
	root.querySelector( 'os-textarea' )!.dispatchEvent( new CustomEvent( 'os-input-change', { detail: { value: 'Another brand' } } ) );
	expect( root.querySelector( '[aria-label="Proposed brand preview"]' ) ).toBeNull();
} );


test.each( [ 'WordPress', 'Paper & red', 'Evergreen', 'Midnight' ] )( '%s closes an AI preview and applies only the preset', async ( preset ) => {
	const { root, click, ui } = mount();
	click( 'Propose branding' ); await tick();
	expect( root.querySelector( '.os-settings__brand-ai-review' ) ).not.toBeNull();
	click( preset );
	expect( root.querySelector( '.os-settings__brand-ai' ) ).toBeNull();
	expect( ui.themes.brandAi?.proposal ).toBeNull();
	expect( bridge.update ).toHaveBeenCalledOnce();
	expect( bridge.update ).toHaveBeenCalledWith( expect.objectContaining( { wallpaper: 'brand-studio' } ) );
	click( 'Make it with AI' );
	expect( root.querySelector( 'os-textarea' )!.getAttribute( 'value' ) ).toBe( 'Use ocean blue branding' );
	expect( root.querySelector( '.os-settings__brand-ai-review' ) ).toBeNull();
} );

test( 'choosing a preset aborts generation and ignores its late response even after reopening AI', async () => {
	const { root, fetch, click } = mount();
	let finish!: ( value: unknown ) => void;
	fetch.mockReturnValue( new Promise( resolve => { finish = resolve; } ) );
	click( 'Propose branding' );
	click( 'Evergreen' );
	expect( fetch.mock.calls[0][1].signal.aborted ).toBe( true );
	expect( root.querySelector( '.os-settings__brand-ai' ) ).toBeNull();
	click( 'Make it with AI' );
	finish( { ok: true, json: async () => proposal() } ); await tick();
	expect( root.querySelector( '.os-settings__brand-ai-review' ) ).toBeNull();
	expect( root.querySelector( '.os-settings__brand-ai-progress' ) ).toBeNull();
	expect( bridge.update ).toHaveBeenCalledOnce();
} );
