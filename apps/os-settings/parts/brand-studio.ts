import { closeBrandAi, renderBrandAi, renderBrandAiButton } from './brand-ai';
import { canManageBranding } from '../../../src/settings/site-branding';
/** Brand Studio — a compact palette editor immediately below the theme library. */
import { __, html } from '@openstation/app';
import {
	BRAND_DEFAULTS, BRAND_OPACITY_DEFAULTS, BRAND_THEME_SLUG, brandColors,
	sanitizeBrandFont, type BrandPalette, type BrandRole, type BrandOpacity,
} from '../../../src/desktop-themes/brand-palette';
import { settings, update } from './store';
import { uiOf, type Ctx, type Section } from './types';

/** Brand surfaces first, then accents and semantic signals. */
const groups = () => [
	{ title: __( 'Brand' ), description: __( 'Set the mood. Depth, borders, and quieter text are calculated for you.' ), roles: [
		[ 'canvas', __( 'Canvas' ), __( 'Desktop backdrop, resting chrome, and dock glass.' ) ],
		[ 'surface', __( 'Surfaces' ), __( 'Windows, cards, fields, menus, and dialogs.' ) ],
		[ 'text', __( 'Text' ), __( 'Preferred ink. Adjusted where needed to keep text readable.' ) ],
	] },
	{ title: __( 'Accents' ), description: __( 'Actions, gradients, glints, and highlights that bring your brand to life.' ), roles: [
		[ 'primary', __( 'Primary' ), __( 'Buttons, focus rings, selection, and active details.' ) ],
		[ 'secondary', __( 'Secondary' ), __( 'The second voice in your gradients and luminous edges.' ) ],
		[ 'highlight', __( 'Highlight' ), __( 'Finishing colour for gradients, ratings, and highlights.' ) ],
	] },
	{ title: __( 'Status colours' ), description: __( 'Keep success, caution, errors, and information recognisable in your brand.' ), roles: [
		[ 'success', __( 'Success' ), __( 'Positive notices, saved states, and success badges.' ) ],
		[ 'warning', __( 'Warning' ), __( 'Caution notices and warning badges.' ) ],
		[ 'danger', __( 'Danger' ), __( 'Errors, destructive actions, and failure states.' ) ],
		[ 'info', __( 'Information' ), __( 'Informational notices and badges.' ) ],
	] },
];

const presets = () => [
	{ label: __( 'WordPress' ), palette: { ...BRAND_DEFAULTS } },
	{ label: __( 'Paper & red' ), palette: { ...BRAND_DEFAULTS, primary: '#e41e2b', secondary: '#202124', highlight: '#edb4a5', canvas: '#eee9e5', surface: '#ffffff', text: '#242021' } },
	{ label: __( 'Evergreen' ), palette: { ...BRAND_DEFAULTS, primary: '#087f5b', secondary: '#c5a66a', highlight: '#e4e8c5', canvas: '#e7eee9', surface: '#fcfdf9', text: '#17372e' } },
	{ label: __( 'Midnight' ), palette: { ...BRAND_DEFAULTS, primary: '#749cff', secondary: '#8866dd', highlight: '#8cddd0', canvas: '#101622', surface: '#1b2435', text: '#edf2ff' } },
];

/** Save a palette checkpoint before a gesture; Undo restores the whole gesture. */
function checkpoint( ctx: Ctx ): void {
	const { brandPalette, wallpaper, brandFont, brandOpacity } = settings();
	uiOf( ctx ).themes.brandUndo = { brandPalette: { ...brandPalette }, wallpaper, brandFont, brandOpacity: { ...brandOpacity } };
}

function replacePalette( ctx: Ctx, palette: BrandPalette, applyBackdrop = false ): void {
	checkpoint( ctx );
	uiOf( ctx ).themes.brandDrafts = {};
	update( { brandPalette: palette, ...( applyBackdrop ? { wallpaper: 'brand-studio', brandOpacity: { ...BRAND_OPACITY_DEFAULTS } } : {} ) } );
}

function colorField( ctx: Ctx, p: BrandPalette, row: string[] ) {
	const [ key, label, description ] = row;
	const role = key as BrandRole;
	const ui = uiOf( ctx ).themes;
	return html`<div class="os-settings__brand-color" @focusin=${ ( event: FocusEvent ) => {
		if ( ! ( event.currentTarget as HTMLElement ).contains( event.relatedTarget as Node | null ) ) {
			checkpoint( ctx );
		}
	} }>
		<os-color-picker id=${ `os-settings-brand-${ role }` } label=${ label } value=${ p[ role ] }
			@os-color-change=${ ( e: CustomEvent< { value: string } > ) => {
				delete ui.brandDrafts?.[ role ];
				update( { brandPalette: { ...settings().brandPalette, [ role ]: e.detail.value } } );
			} }></os-color-picker>
		<p class="os-settings__brand-help">${ description }</p>
	</div>`;
}

function glassField( ctx: Ctx, key: keyof BrandOpacity, label: string, description: string ) {
	return html`<div class="os-settings__brand-color" @focusin=${ () => checkpoint( ctx ) }>
		<os-range-field label=${ label } value=${ settings().brandOpacity[ key ] } min="0" max="100" step="1" suffix="%"
			@os-range-change=${ ( event: CustomEvent< { value: number } > ) => update( {
				brandOpacity: { ...settings().brandOpacity, [ key ]: event.detail.value },
			} ) }></os-range-field>
		<p class="os-settings__brand-help">${ description }</p>
	</div>`;
}

export const renderBrandStudio: Section = ( s, ctx ) => {
	if ( s.desktopTheme !== BRAND_THEME_SLUG || ! canManageBranding( ctx.data.isAdmin ) ) {
		return html``;
	}
	const p = s.brandPalette;
	const ui = uiOf( ctx ).themes;
	const colors = brandColors( p );
	return html`<div class="os-settings__brand-studio">
		<div class="os-settings__brand-heading">
			<div><h3>${ __( 'Make it yours' ) }</h3><p>${ __( 'Ten colours. One coherent station. Applies to every user on this site.' ) }</p></div>
			<os-badge tone="success">${ __( 'Live preview' ) }</os-badge>
		</div>
		<div class="os-settings__brand-presets" role="group" aria-label=${ __( 'Starting palettes' ) }>
			${ presets().map( ( preset ) => html`<os-button variant="secondary" data-brand-preset
				@click=${ () => {
					closeBrandAi( ctx );
					replacePalette( ctx, preset.palette, true );
				} }>${ preset.label }</os-button>` ) }
			${ renderBrandAiButton( ctx ) }
		</div>
		<p class="os-settings__brand-help">${ __( 'Starting palettes also apply their matching desktop backdrop.' ) }</p>
		${ renderBrandAi( ctx ) }
		<os-checkbox-label label=${ __( 'Allow users to choose their own wallpaper' ) } ?checked=${ s.brandAllowWallpaper }
			@os-checkbox-change=${ ( event: CustomEvent< { checked: boolean } > ) => update( { brandAllowWallpaper: event.detail.checked } ) }></os-checkbox-label>
		<p class="os-settings__brand-help">${ __( 'Each person can choose a wallpaper in Appearance. Turn this off to use the brand backdrop for everyone. Their personal choices are kept for when you allow them again.' ) }</p>
		<os-select id="os-settings-brand-font" class="os-settings__brand-font" label=${ __( 'Interface font' ) } value=${ s.brandFont }
			@os-pick=${ ( e: CustomEvent< { value: string } > ) => {
				checkpoint( ctx );
				update( { brandFont: sanitizeBrandFont( e.detail.value ) } );
			} }>
			<os-option value="geist">${ __( 'Geist — modern' ) }</os-option>
			<os-option value="system">${ __( 'System — familiar' ) }</os-option>
			<os-option value="classic">${ __( 'Arial — classic' ) }</os-option>
			<os-option value="editorial">${ __( 'Georgia — editorial' ) }</os-option>
			<os-option value="mono">${ __( 'Geist Mono — technical' ) }</os-option>
		</os-select>
		<div class="os-settings__brand-sample" aria-label=${ __( 'Live colour sample' ) }>
			<div class="os-settings__brand-sample-title">${ __( 'Your station, in your colours' ) }</div>
			<div class="os-settings__brand-sample-content">
				<strong>${ __( 'Ready for a fresh look' ) }</strong>
				<p>${ __( 'Surfaces, text, and interaction states follow your palette.' ) }</p>
				<div class="os-settings__brand-sample-actions"><os-button variant="primary">${ __( 'Primary action' ) }</os-button><os-button variant="secondary">${ __( 'Secondary' ) }</os-button><os-badge tone="success">${ __( 'Success' ) }</os-badge></div>
			</div>
		</div>
		${ groups().map( ( group ) => html`<os-section heading=${ group.title } description=${ group.description }>
			<div class="os-settings__brand-colors">${ group.roles.map( ( row ) => colorField( ctx, p, row ) ) }</div>
		</os-section>` ) }
		<os-section heading=${ __( 'Glass & depth' ) } description=${ __( 'Let the wallpaper through while keeping text and icons crisp. Colour opacity blends each role with its foundation; glass opacity controls actual surface transparency.' ) }>
			<div class="os-settings__brand-colors os-settings__brand-glass">
				${ glassField( ctx, 'widgets', __( 'Widget opacity' ), __( 'A softer background for desktop widgets. Text stays readable as the glass changes.' ) ) }
				${ glassField( ctx, 'dock', __( 'Dock opacity' ), __( 'A distinct dock tint and a permanent edge separate navigation from the wallpaper.' ) ) }
			</div>
		</os-section>
		<p class="os-settings__brand-help" role="status">${ colors.ink !== p.text
			? __( 'Text is being adjusted for contrast. Your chosen colour is kept; readable shades are used on surfaces.' )
			: __( 'Readable text, softer shades, translucent glass, and gradient stops are calculated automatically.' ) }</p>
		<div class="os-settings__brand-presets">
			<os-button variant="secondary" ?disabled=${ ! ui.brandUndo } @click=${ () => {
				const previous = ui.brandUndo;
				if ( previous ) {
					checkpoint( ctx );
					ui.brandDrafts = {};
					update( { ...previous, wallpaper: 'brand-studio' } );
				}
			} }>${ __( 'Undo last change' ) }</os-button>
			<os-button variant="ghost" @click=${ () => replacePalette( ctx, { ...BRAND_DEFAULTS } ) }>${ __( 'Reset colours' ) }</os-button>
			<os-button variant="secondary" @click=${ () => {
 checkpoint( ctx ); update( { wallpaper: 'brand-studio' } );
} }>${ s.wallpaper === 'brand-studio' ? __( 'Brand backdrop active' ) : __( 'Use brand backdrop' ) }</os-button>
		</div>
		<p class="os-settings__brand-help">${ __( 'Saved for this site automatically. Only site administrators can edit this brand. Other sites in the network keep their own branding.' ) }</p>
	</div>`;
};
