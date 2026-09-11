/**
 * Brand Studio's colour compiler. PHP uses the same recipe data and
 * colour arithmetic for the first paint; this leaf runs on live edits.
 * No token-name guessing, DOM sampling, or user-supplied CSS.
 */
import recipe from '../../assets/desktop-themes/brand-studio/palette.json';

export const BRAND_FONTS = recipe.fonts;
export type BrandFont = keyof typeof BRAND_FONTS;

/** Only bundled or system font stacks may enter a theme. */
export function sanitizeBrandFont( raw: unknown, fallback: BrandFont = 'geist' ): BrandFont {
	return typeof raw === 'string' && Object.prototype.hasOwnProperty.call( BRAND_FONTS, raw ) ? raw as BrandFont : fallback;
}

export const BRAND_THEME_SLUG = 'openstation-brand-studio';
export type BrandRole = keyof typeof recipe.defaults;
export type BrandPalette = Record< BrandRole, string >;
export const BRAND_DEFAULTS: Readonly< BrandPalette > = Object.freeze( recipe.defaults );
export const BRAND_ROLES = Object.keys( BRAND_DEFAULTS ) as BrandRole[];

/** Admit only known roles and complete RGB or RGBA hex colours. */
export function sanitizeBrandPalette( raw: unknown, fallback: BrandPalette = BRAND_DEFAULTS ): BrandPalette {
	const source = raw && typeof raw === 'object' && ! Array.isArray( raw )
		? raw as Record< string, unknown > : {};
	return Object.fromEntries( BRAND_ROLES.map( ( role ) => {
		const value = source[ role ];
		return [ role, typeof value === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test( value )
			? value.toLowerCase() : fallback[ role ] ];
	} ) ) as BrandPalette;
}

export const BRAND_OPACITY_DEFAULTS = Object.freeze( recipe.opacityDefaults );
export type BrandOpacity = typeof recipe.opacityDefaults;

/** Independent glass strength, persisted as integer percentages including zero. */
export function sanitizeBrandOpacity( raw: unknown, fallback: BrandOpacity = BRAND_OPACITY_DEFAULTS ): BrandOpacity {
	const source = raw && typeof raw === 'object' ? raw as Record< string, unknown > : {};
	return Object.fromEntries( Object.entries( fallback ).map( ( [ key, value ] ) => {
		const candidate = source[ key ];
		return [ key, typeof candidate === 'number' && Number.isFinite( candidate )
			? Math.round( Math.max( 0, Math.min( 100, candidate ) ) ) : value ];
	} ) ) as BrandOpacity;
}

/** Composite an alpha colour onto a known opaque foundation. */
export function compositeColor( color: string, background: string ): string {
	return mixColor( background, color, color.length === 9 ? parseInt( color.slice( 7 ), 16 ) / 255 : 1 );
}

/** sRGB channels, matching PHP's hexdec conversion. */
export function channels( hex: string ): number[] {
	return [ 1, 3, 5 ].map( ( offset ) => parseInt( hex.slice( offset, offset + 2 ), 16 ) );
}

/** Blend in sRGB; used for surface depth and soft gradient stops. */
export function mixColor( a: string, b: string, weight: number ): string {
	const other = channels( b );
	const parts = Math.round( weight * 1000 );
	return '#' + channels( a ).map( ( channel, i ) =>
		Math.floor( ( channel * ( 1000 - parts ) + other[ i ] * parts + 500 ) / 1000 ).toString( 16 ).padStart( 2, '0' ),
	).join( '' );
}

/** WCAG relative luminance for an opaque sRGB colour. */
function luminance( color: string ): number {
	return channels( color ).reduce( ( total, channel, i ) => {
		const c = channel / 255;
		return total + ( c <= 0.04045 ? c / 12.92 : ( ( c + 0.055 ) / 1.055 ) ** 2.4 ) * [ 0.2126, 0.7152, 0.0722 ][ i ];
	}, 0 );
}

/** Contrast ratio between two opaque colours. */
export function contrastRatio( a: string, b: string ): number {
	const l1 = luminance( a );
	const l2 = luminance( b );
	return ( Math.max( l1, l2 ) + 0.05 ) / ( Math.min( l1, l2 ) + 0.05 );
}

/** Keep the chosen hue where possible, moving toward readable ink. */
export function readableColor( preferred: string, background: string, otherBackground = background ): string {
	const score = ( color: string ) => Math.min( contrastRatio( color, background ), contrastRatio( color, otherBackground ) );
	const target = score( '#000000' ) >= score( '#ffffff' ) ? '#000000' : '#ffffff';
	for ( let step = 0; step <= 20; step++ ) {
		const candidate = mixColor( preferred, target, step / 20 );
		if ( score( candidate ) >= 4.5 ) {
			return candidate;
		}
	}
	return target;
}

/** Derived colours are computed once per edit, then shared by all tokens. */
export function brandColors( raw: unknown, backdrop = false, opacity?: unknown ): Record< string, string > {
	const source = sanitizeBrandPalette( raw );
	const glass = sanitizeBrandOpacity( opacity );
	// Resolve foundation alpha once, avoiding stacked transparent cards and
	// keeping generated text contrast independent of window overlap.
	const canvas = compositeColor( source.canvas, BRAND_DEFAULTS.canvas );
	const surface = compositeColor( source.surface, canvas );
	const p = Object.fromEntries( BRAND_ROLES.map( ( role ) => [ role, compositeColor( source[ role ], surface ) ] ) ) as BrandPalette;
	p.canvas = canvas;
	p.surface = surface;
	const ink = readableColor( p.text, p.surface );
	// Move the depth step away from the readable ink, so middle greys
	// cannot cross the contrast boundary when a field is elevated.
	const lift = contrastRatio( '#000000', p.surface ) >= contrastRatio( '#ffffff', p.surface ) ? '#ffffff' : '#000000';
	const elevated = mixColor( p.surface, lift, 0.08 );
	const hover = mixColor( p.surface, ink, 0.14 );
	const colors: Record< string, string > = {
		...p,
		ink,
		elevated,
		modalHover: contrastRatio( ink, hover ) >= 4.5 ? hover : mixColor( p.surface, lift, 0.16 ),
		border: mixColor( p.surface, ink, 0.3 ),
		muted: readableColor( mixColor( ink, p.surface, 0.24 ), p.surface ),
		canvasInk: readableColor( p.text, p.canvas ),
		canvasDepth: mixColor( p.canvas, contrastRatio( '#000000', p.canvas ) >= contrastRatio( '#ffffff', p.canvas ) ? '#ffffff' : '#000000', 0.12 ),
		desktopInk: backdrop && contrastRatio( '#000000', p.canvas ) >= contrastRatio( '#ffffff', p.canvas ) ? '#000000' : '#ffffff',
		canvasMuted: readableColor( mixColor( p.text, p.canvas, 0.24 ), p.canvas ),
		accentInk: readableColor( '#ffffff', p.primary ),
		link: readableColor( p.primary, p.surface ),
		dim: mixColor( p.primary, p.canvas, 0.18 ),
		dangerHover: mixColor( p.danger, ink, 0.15 ),
	};
	for ( const role of BRAND_ROLES ) {
		colors[ `${ role }Tint` ] = mixColor( p[ role ], '#ffffff', 0.72 );
		colors[ `${ role }Text` ] = readableColor( p[ role ], p.surface );
	}
	colors.dangerInk = readableColor( '#ffffff', colors.dangerText );
	for ( const [ name, color ] of Object.entries( colors ) ) {
		colors[ `${ name }Rgb` ] = channels( color ).join( ', ' );
	}
	// Dock tint moves away from the wallpaper; its edge remains visible even
	// when the user deliberately turns the glass all the way down.
	const dockContrast = contrastRatio( '#000000', canvas ) >= contrastRatio( '#ffffff', canvas ) ? '#000000' : '#ffffff';
	const dock = mixColor( canvas, dockContrast, 0.18 );
	const dockPaint = mixColor( canvas, dock, glass.dock / 100 );
	const widgetPaint = mixColor( canvas, surface, glass.widgets / 100 );
	const widgetDepth = mixColor( colors.canvasDepth, surface, glass.widgets / 100 );
	colors.dockGlass = `rgba(${ channels( dock ).join( ', ' ) }, ${ glass.dock / 100 })`;
	colors.dockInk = readableColor( colors.canvasInk, dockPaint );
	colors.dockBorder = mixColor( canvas, dockContrast, 0.45 );
	colors.widgetGlass = `rgba(${ channels( surface ).join( ', ' ) }, ${ glass.widgets / 100 })`;
	colors.widgetInk = readableColor( p.text, widgetPaint, widgetDepth );
	colors.widgetMuted = readableColor( mixColor( colors.widgetInk, widgetPaint, 0.24 ), widgetPaint, widgetDepth );
	colors.widgetInkRgb = channels( colors.widgetInk ).join( ', ' );
	return colors;
}

/** Compile the shared, explicitly assigned token recipes to concrete CSS values. */
export function compileBrandPalette( raw: unknown, backdrop = false, font: unknown = 'geist', opacity?: unknown ): Record< string, string > {
	const colors = brandColors( raw, backdrop, opacity );
	const tokens = Object.fromEntries( Object.entries( recipe.tokens ).map( ( [ token, value ] ) =>
		[ token, value.replace( /\{(\w+)\}/g, ( _match, name: string ) => colors[ name ] ) ],
	) );
	for ( const token of [ '--os-font', '--os-titlebar-font', '--os-ui-font' ] ) {
		tokens[ token ] = BRAND_FONTS[ sanitizeBrandFont( font ) ];
	}
	return tokens;
}
