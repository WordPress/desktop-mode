/** Brand Studio's live layer. Removing the theme removes this entire layer. */
import { BRAND_THEME_SLUG, compileBrandPalette } from './brand-palette';

const STYLE_ID = 'os-brand-studio-live';

/** Scope to the shell document and its body-mounted overlays, never iframes. */
export function applyBrandPalette( themeId: string | null, palette: unknown, wallpaper?: string, font?: string, opacity?: unknown ): void {
	let style = document.getElementById( STYLE_ID ) as HTMLStyleElement | null;
	if ( themeId !== BRAND_THEME_SLUG ) {
		style?.remove();
		return;
	}
	const tokens = compileBrandPalette( palette, wallpaper === 'brand-studio', font, opacity );
	const declarations = Object.entries( tokens ).map( ( [ key, value ] ) => {
		// Preferences' independent accent picker writes inline. This theme
		// owns its brand colours while active; removing it restores that pick.
		const priority = [ '--wp-admin-theme-color', '--os-ui-accent', '--os-ui-accent-dim' ].includes( key ) ? ' !important' : '';
		return `${ key }:${ value }${ priority };`;
	} ).join( '' );
	const css = `body.os-active.os-desktop-theme-${ BRAND_THEME_SLUG }, body.os-active .os-shell[data-os-desktop-theme="${ BRAND_THEME_SLUG }"]{${ declarations }}`;
	if ( ! style ) {
		style = document.createElement( 'style' );
		style.id = STYLE_ID;
		document.head.appendChild( style );
	}
	if ( style.textContent !== css ) {
		style.textContent = css;
	}
}
