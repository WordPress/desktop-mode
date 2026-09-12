/** Site branding policy and synchronization through the existing Heartbeat bus. */
import { heartbeat } from '../heartbeat';
import { BRAND_THEME_SLUG, sanitizeBrandOpacity, type BrandOpacity, sanitizeBrandFont, sanitizeBrandPalette, type BrandPalette, type BrandFont } from '../desktop-themes/brand-palette';
import type { OsSettingsState } from './types';

export interface SiteBrandingSnapshot {
	enabled: boolean;
	canManage: boolean;
	siteId: number;
	revision: string;
	brandPalette: BrandPalette;
	brandFont: BrandFont;
	brandOpacity: BrandOpacity;
	brandAllowWallpaper: boolean;
	personalTheme: string;
	personalWallpaper: string;
}

type BrandingWindow = Window & { openStationConfig?: { siteBranding?: SiteBrandingSnapshot } };

/** Shared boot facts, also visible to the separately built Preferences app. */
export function siteBranding(): SiteBrandingSnapshot | undefined {
	return ( window as BrandingWindow ).openStationConfig?.siteBranding;
}

/** Editing capability is site-scoped; standalone hosts use their own admin flag. */
export function canManageBranding( fallback = false ): boolean {
	return siteBranding()?.canManage ?? fallback;
}

/** Clamp personal writes before optimistic paint; the REST boundary enforces this too. */
export function guardBrandingPatch( patch: Partial< OsSettingsState >, state: OsSettingsState ): Partial< OsSettingsState > {
	const policy = siteBranding();
	if ( ! policy ) {
		return patch;
	}
	const out = { ...patch };
	if ( ! policy.canManage ) {
		delete out.brandPalette;
		delete out.brandFont;
		delete out.brandOpacity;
		delete out.brandAllowWallpaper;
		if ( policy.enabled || state.desktopTheme === BRAND_THEME_SLUG || out.desktopTheme === BRAND_THEME_SLUG ) {
			delete out.desktopTheme;
		}
	}
	const active = ( policy.enabled && ! policy.canManage ) || out.desktopTheme === BRAND_THEME_SLUG || ( ! ( 'desktopTheme' in out ) && state.desktopTheme === BRAND_THEME_SLUG );
	const allowWallpaper = policy.canManage ? ( out.brandAllowWallpaper ?? state.brandAllowWallpaper ) : policy.brandAllowWallpaper !== false;
	if ( active && ( ! allowWallpaper || out.desktopTheme === BRAND_THEME_SLUG ) ) {
		out.wallpaper = 'brand-studio';
	} else if ( active && out.brandAllowWallpaper === true && ! state.brandAllowWallpaper && ! ( 'wallpaper' in out ) ) {
		out.wallpaper = policy.personalWallpaper;
	}
	return out;
}

/** Workspace styling must never override an enforced site brand, even for admins. */
export function guardBrandingWorkspace( patch: Partial< OsSettingsState > | null, state: OsSettingsState ): Partial< OsSettingsState > | null {
	if ( ! patch || ! siteBranding() ) {
		return patch;
	}
	const out = { ...patch };
	delete out.brandPalette;
	delete out.brandFont;
	delete out.brandOpacity;
	delete out.brandAllowWallpaper;
	if ( state.desktopTheme === BRAND_THEME_SLUG ) {
		delete out.desktopTheme;
		if ( ! state.brandAllowWallpaper ) {
			delete out.wallpaper;
		}
	} else if ( out.desktopTheme === BRAND_THEME_SLUG ) {
		delete out.desktopTheme;
	}
	return out;
}

/** Resetting personal preferences does not disable or reset site branding. */
export function preserveBrandingOnReset( next: OsSettingsState, current: OsSettingsState ): void {
	if ( ! siteBranding() ) {
		return;
	}
	next.brandPalette = { ...current.brandPalette };
	next.brandFont = current.brandFont;
	next.brandOpacity = { ...current.brandOpacity };
	next.brandAllowWallpaper = current.brandAllowWallpaper;
	if ( current.desktopTheme === BRAND_THEME_SLUG ) {
		next.desktopTheme = current.desktopTheme;
		if ( ! current.brandAllowWallpaper ) {
			next.wallpaper = current.wallpaper;
		}
	}
}

/** Reflect optimistic activation for other client APIs, with rollback handled identically. */
export function reflectBrandingState( state: OsSettingsState ): void {
	const policy = siteBranding();
	if ( policy?.canManage ) {
		policy.enabled = state.desktopTheme === BRAND_THEME_SLUG;
		policy.brandAllowWallpaper = state.brandAllowWallpaper;
	}
	if ( policy && ( ! policy.enabled || policy.brandAllowWallpaper ) ) {
		policy.personalWallpaper = state.wallpaper;
	}
}

/** Apply shared changes without replacing an unlocked user's current wallpaper. */
export function brandingSnapshotPatch( snapshot: SiteBrandingSnapshot, state: OsSettingsState ): Partial< OsSettingsState > {
	const wasActive = state.desktopTheme === BRAND_THEME_SLUG;
	const patch: Partial< OsSettingsState > = { brandPalette: snapshot.brandPalette, brandFont: snapshot.brandFont, brandOpacity: snapshot.brandOpacity, brandAllowWallpaper: snapshot.brandAllowWallpaper };
	if ( snapshot.enabled ) {
		patch.desktopTheme = BRAND_THEME_SLUG;
		if ( ! snapshot.brandAllowWallpaper ) {
			patch.wallpaper = 'brand-studio';
		} else if ( ! state.brandAllowWallpaper || ! wasActive ) {
			patch.wallpaper = snapshot.personalWallpaper;
		}
	} else if ( wasActive ) {
		patch.desktopTheme = snapshot.personalTheme;
		patch.wallpaper = snapshot.personalWallpaper;
	}
	return patch;
}

/**
 * Subscribe once per shell. Ignore replies sent before/during a local edit;
 * generation echo prevents a delayed Heartbeat from undoing a newly saved brand.
 */
export function watchSiteBranding( receive: ( snapshot: SiteBrandingSnapshot ) => void ): () => void {
	if ( ! siteBranding() ) {
		return () => undefined;
	}
	let generation = 0;
	let pending = false;
	const lifecycle = ( event: Event ) => {
		const phase = ( event as CustomEvent< { phase: string } > ).detail?.phase;
		pending = phase === 'pending' || phase === 'saving';
		generation++;
	};
	document.addEventListener( 'os-settings-save-lifecycle', lifecycle );
	const stopSend = heartbeat.contribute( 'openstation_site_branding', () => ( { generation } ) );
	const stopReceive = heartbeat.subscribe( 'openstation_site_branding', ( raw: unknown ) => {
		if ( ! raw || typeof raw !== 'object' ) {
			return;
		}
		const value = raw as SiteBrandingSnapshot & { generation: number };
		const previous = siteBranding();
		if ( pending || ! previous || value.generation !== generation || value.siteId !== previous.siteId ||
			typeof value.enabled !== 'boolean' || typeof value.canManage !== 'boolean' || typeof value.revision !== 'string' ||
			typeof value.personalTheme !== 'string' || typeof value.personalWallpaper !== 'string' ) {
			return;
		}
		const next: SiteBrandingSnapshot = {
			...value,
			brandPalette: sanitizeBrandPalette( value.brandPalette ),
			brandFont: sanitizeBrandFont( value.brandFont ),
			brandOpacity: sanitizeBrandOpacity( value.brandOpacity ),
			brandAllowWallpaper: typeof value.brandAllowWallpaper === 'boolean' ? value.brandAllowWallpaper : true,
		};
		if ( next.revision === previous.revision && next.enabled === previous.enabled && next.canManage === previous.canManage && next.brandAllowWallpaper === previous.brandAllowWallpaper ) {
			return;
		}
		( window as BrandingWindow ).openStationConfig!.siteBranding = next;
		receive( next );
	} );
	return () => {
		stopSend();
		stopReceive();
		document.removeEventListener( 'os-settings-save-lifecycle', lifecycle );
	};
}
