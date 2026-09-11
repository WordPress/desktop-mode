import { afterEach, expect, test, vi } from 'vitest';
import { DEFAULTS } from '../../src/settings/constants';
import { BRAND_DEFAULTS, BRAND_THEME_SLUG } from '../../src/desktop-themes/brand-palette';
import { brandingSnapshotPatch, guardBrandingPatch, guardBrandingWorkspace, preserveBrandingOnReset, watchSiteBranding, type SiteBrandingSnapshot } from '../../src/settings/site-branding';

const bus = vi.hoisted( () => ({ send: undefined as undefined | (() => unknown), receive: undefined as undefined | ((v: unknown) => void) }) );
vi.mock( '../../src/heartbeat', () => ({ heartbeat: {
	contribute: (_field: string, supplier: () => unknown) => { bus.send = supplier; return vi.fn(); },
	subscribe: (_field: string, receive: (v: unknown) => void) => { bus.receive = receive; return vi.fn(); },
} }) );
const host = window as unknown as { openStationConfig?: { siteBranding: SiteBrandingSnapshot } };
const active = () => ({ ...structuredClone( DEFAULTS ), desktopTheme: BRAND_THEME_SLUG, wallpaper: 'brand-studio', brandAllowWallpaper: false });
const policy = ( enabled = true, canManage = false ): SiteBrandingSnapshot => ({
	enabled, canManage, brandAllowWallpaper: false, siteId: 1, revision: 'one', brandPalette: { ...BRAND_DEFAULTS }, brandFont: 'geist', brandOpacity: { widgets: 82, dock: 94 }, personalTheme: '', personalWallpaper: 'forest',
});
afterEach( () => { delete host.openStationConfig; vi.clearAllMocks(); } );

test( 'non-admin patches cannot activate, edit or override the site brand', () => {
	host.openStationConfig = { siteBranding: policy() };
	const result = guardBrandingPatch( { desktopTheme: '', wallpaper: 'galaxy', brandPalette: { ...BRAND_DEFAULTS, primary: '#123456' }, brandFont: 'editorial', brandOpacity: { widgets: 0, dock: 0 }, dockSize: 'large' }, active() );
	expect( result ).toEqual( { wallpaper: 'brand-studio', dockSize: 'large' } );
	host.openStationConfig.siteBranding.enabled = false;
	expect( guardBrandingPatch( { desktopTheme: BRAND_THEME_SLUG }, DEFAULTS ) ).not.toHaveProperty( 'desktopTheme' );
	expect( guardBrandingPatch( { desktopTheme: 'desktop-mode-legacy' }, DEFAULTS ).desktopTheme ).toBe( 'desktop-mode-legacy' );
} );

test( 'admin activation selects the site backdrop, while release allows personal choices', () => {
	host.openStationConfig = { siteBranding: policy( false, true ) };
	expect( guardBrandingPatch( { desktopTheme: BRAND_THEME_SLUG }, DEFAULTS ) ).toEqual( { desktopTheme: BRAND_THEME_SLUG, wallpaper: 'brand-studio' } );
	expect( guardBrandingPatch( { desktopTheme: '', wallpaper: 'forest' }, active() ) ).toEqual( { desktopTheme: '', wallpaper: 'forest' } );
} );

test( 'personal wallpapers are allowed without allowing users to change site policy', () => {
	host.openStationConfig = { siteBranding: { ...policy(), brandAllowWallpaper: true } };
	const current = { ...active(), brandAllowWallpaper: true };
	expect( guardBrandingPatch( { wallpaper: 'forest', brandAllowWallpaper: false, brandFont: 'mono' }, current ) ).toEqual( { wallpaper: 'forest' } );
	expect( guardBrandingWorkspace( { wallpaper: 'forest', desktopTheme: '', brandAllowWallpaper: false }, current ) ).toEqual( { wallpaper: 'forest' } );
	const next = structuredClone( DEFAULTS );
	preserveBrandingOnReset( next, current );
	expect( next.wallpaper ).toBe( DEFAULTS.wallpaper );
	expect( next.desktopTheme ).toBe( BRAND_THEME_SLUG );
	expect( next.brandAllowWallpaper ).toBe( true );
} );

test( 'administrators can lock the backdrop and restore their stored wallpaper when unlocking', () => {
	host.openStationConfig = { siteBranding: policy( true, true ) };
	expect( guardBrandingPatch( { brandAllowWallpaper: true }, active() ) ).toEqual( { brandAllowWallpaper: true, wallpaper: 'forest' } );
	expect( guardBrandingPatch( { brandAllowWallpaper: false }, { ...active(), wallpaper: 'forest', brandAllowWallpaper: true } ) ).toEqual( { brandAllowWallpaper: false, wallpaper: 'brand-studio' } );
} );

test( 'workspace overrides and personal reset cannot remove site branding, including for admins', () => {
	host.openStationConfig = { siteBranding: policy( true, true ) };
	expect( guardBrandingWorkspace( { desktopTheme: '', wallpaper: 'forest', brandFont: 'mono', brandOpacity: { widgets: 0, dock: 0 }, dockSize: 'large' }, active() ) ).toEqual( { dockSize: 'large' } );
	const next = structuredClone( DEFAULTS );
	const current = { ...active(), brandFont: 'editorial' as const };
	preserveBrandingOnReset( next, current );
	expect( next.desktopTheme ).toBe( BRAND_THEME_SLUG );
	expect( next.wallpaper ).toBe( 'brand-studio' );
	expect( next.brandFont ).toBe( 'editorial' );
} );

test( 'Heartbeat delivers site changes without writes and rejects another site or delayed replies', () => {
	host.openStationConfig = { siteBranding: policy() };
	const receive = vi.fn();
	const stop = watchSiteBranding( receive );
	const response = ( overrides = {} ) => ({ ...policy(), revision: 'two', ...(bus.send!() as object), ...overrides });
	bus.receive!( response( { siteId: 2 } ) );
	expect( receive ).not.toHaveBeenCalled();
	const oldReply = response();
	document.dispatchEvent( new CustomEvent( 'os-settings-save-lifecycle', { detail: { phase: 'pending' } } ) );
	bus.receive!( response() );
	expect( receive ).not.toHaveBeenCalled();
	const duringSave = response();
	document.dispatchEvent( new CustomEvent( 'os-settings-save-lifecycle', { detail: { phase: 'saved' } } ) );
	bus.receive!( oldReply );
	bus.receive!( duringSave );
	expect( receive ).not.toHaveBeenCalled();
	bus.receive!( response( { brandFont: 'editorial', brandOpacity: { widgets: 0, dock: 30 } } ) );
	expect( receive ).toHaveBeenCalledOnce();
	expect( host.openStationConfig!.siteBranding.brandFont ).toBe( 'editorial' );
	expect( host.openStationConfig!.siteBranding.brandOpacity ).toEqual( { widgets: 0, dock: 30 } );
	bus.receive!( response( { enabled: false, revision: 'three' } ) );
	expect( receive ).toHaveBeenLastCalledWith( expect.objectContaining( { enabled: false, personalWallpaper: 'forest' } ) );
	stop();
} );

test( 'live colour changes preserve personal wallpaper; locking and unlocking restore it', () => {
	const unlocked = { ...policy(), brandAllowWallpaper: true };
	const current = { ...active(), brandAllowWallpaper: true, wallpaper: 'snow' };
	expect( brandingSnapshotPatch( unlocked, current ) ).not.toHaveProperty( 'wallpaper' );
	expect( brandingSnapshotPatch( policy(), current ).wallpaper ).toBe( 'brand-studio' );
	expect( brandingSnapshotPatch( unlocked, active() ).wallpaper ).toBe( 'forest' );
	expect( brandingSnapshotPatch( unlocked, DEFAULTS ).wallpaper ).toBe( 'forest' );
	expect( brandingSnapshotPatch( { ...unlocked, enabled: false }, active() ).wallpaper ).toBe( 'forest' );
} );
