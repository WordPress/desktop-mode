/** AI proposals stay in this window until the administrator explicitly applies one. */
import { __, html } from '@openstation/app';
import { BRAND_FONTS, BRAND_ROLES, BRAND_THEME_SLUG, compileBrandPalette, type BrandFont, type BrandOpacity, type BrandPalette } from '../../../src/desktop-themes/brand-palette';
import { canManageBranding } from '../../../src/settings/site-branding';
import { extraOf, uiOf, type Ctx } from './types';
import { runBrandProposal } from '../../../src/desktop-themes/brand-ai-request';
import { settings, update } from './store';

interface BrandProposal {
	name: string;
	brandPalette: BrandPalette;
	brandFont: BrandFont;
	brandOpacity: BrandOpacity;
	sources: { title: string; url: string }[];
	webSearch: boolean;
	warning: string;
}

export interface BrandAiState {
	open: boolean;
	brief: string;
	busy: boolean;
	error: string;
	proposal: BrandProposal | null;
	controller: AbortController | null;
}

function state( ctx: Ctx ): BrandAiState {
	return uiOf( ctx ).themes.brandAi ??= { open: false, brief: '', busy: false, error: '', proposal: null, controller: null };
}

/** Connector status refreshes with Preferences; the personal assistant toggle is unrelated. */
function available( ctx: Ctx ): boolean {
	return canManageBranding( ctx.data.isAdmin ) && ctx.data.aiAssistant?.available === true &&
		ctx.data.aiAssistant.providerConfigured === true;
}

/** Validate even a successful response before putting values in preview CSS. */
export function readBrandProposal( raw: unknown ): BrandProposal {
	if ( ! raw || typeof raw !== 'object' ) {
		throw new Error( __( 'The assistant returned an incomplete proposal.' ) );
	}
	const value = raw as BrandProposal;
	if ( typeof value.name !== 'string' ||
		! value.brandPalette || ! BRAND_ROLES.every( ( role ) => typeof value.brandPalette[ role ] === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test( value.brandPalette[ role ] ) ) ||
		! Object.prototype.hasOwnProperty.call( BRAND_FONTS, value.brandFont ) || ! value.brandOpacity ||
		! [ value.brandOpacity.widgets, value.brandOpacity.dock ].every( ( n ) => Number.isInteger( n ) && n >= 0 && n <= 100 ) ) {
		throw new Error( __( 'The assistant returned an incomplete proposal.' ) );
	}
	return {
		...value,
		webSearch: value.webSearch === true,
		warning: typeof value.warning === 'string' ? value.warning : '',
		sources: Array.isArray( value.sources ) ? value.sources.filter( ( source ) =>
			source && typeof source.title === 'string' && typeof source.url === 'string' && /^https?:\/\//i.test( source.url ),
		).slice( 0, 5 ) : [],
	};
}

/** Read-only request; cancel or a newer request makes late responses irrelevant. */
export async function requestBrandProposal( ctx: Ctx ): Promise< void > {
	const ui = state( ctx );
	if ( ui.busy || ! available( ctx ) || ui.brief.trim().length < 3 ) {
		return;
	}
	const controller = new AbortController();
	ui.controller = controller;
	ui.busy = true;
	ui.error = '';
	ui.proposal = null;
	ctx.repaint();
	try {
		const data = await runBrandProposal( { fetch: ctx.fetch, endpoint: extraOf( ctx ).brandProposalUrl }, ui.brief.trim(), controller.signal );
		if ( ui.controller === controller && ui.open && available( ctx ) && ctx.root.isConnected ) {
			ui.proposal = readBrandProposal( data );
		}
	} catch ( error ) {
		if ( ui.controller === controller && ! controller.signal.aborted ) {
			ui.error = error instanceof Error ? error.message : __( 'The assistant could not create a proposal. Please try again.' );
		}
	} finally {
		if ( ui.controller === controller ) {
			ui.busy = false;
			ui.controller = null;
			if ( ctx.root.isConnected ) {
				ctx.repaint();
			}
		}
	}
}

/** Close the AI editor and discard pending or completed proposals, retaining the brief. */
export function closeBrandAi( ctx: Ctx ): void {
	const ui = state( ctx );
	ui.controller?.abort();
	ui.controller = null;
	ui.busy = false;
	ui.proposal = null;
	ui.open = false;
	ui.error = '';
	ctx.repaint();
}

/** The preset-row entry point, alongside the built-in brand palettes. */
export function renderBrandAiButton( ctx: Ctx ) {
	if ( ! available( ctx ) ) {
		return html``;
	}
	return html`<span class="os-settings__brand-ai-entry"><os-button variant="secondary" @click=${ () => {
 state( ctx ).open = true; ctx.repaint();
} }>${ __( 'Make it with AI' ) }</os-button></span>`;
}

/** Review colours and settings in an isolated sample before a site-wide write. */
export function renderBrandAi( ctx: Ctx ) {
	const ui = state( ctx );
	if ( ! ui.open || ! available( ctx ) ) {
		return html``;
	}
	const proposal = ui.proposal;
	const tokens = proposal ? compileBrandPalette( proposal.brandPalette, true, proposal.brandFont, proposal.brandOpacity ) : null;
	const previewStyle = tokens ? Object.entries( tokens ).map( ( [ key, value ] ) => `${ key }:${ value }` ).join( ';' ) : '';
	return html`<os-panel class="os-settings__brand-ai">
		<h3>${ __( 'Describe your brand' ) }</h3>
		<p class="os-settings__brand-help">${ __( 'Tell the assistant a brand name or the feeling you want. Review the proposal before applying it to everyone on this site.' ) }</p>
		<os-textarea label=${ __( 'Brand brief' ) } value=${ ui.brief } rows="3" maxlength="2000" ?disabled=${ ui.busy }
			placeholder=${ __( 'For example: use Automattic’s branding, with a bright workspace and subtle glass.' ) }
			@os-input-change=${ ( event: CustomEvent< { value: string } > ) => {
 ui.brief = event.detail.value.slice( 0, 2000 ); ui.proposal = null; ctx.repaint();
} }></os-textarea>
		<div class="os-settings__brand-presets">
			<os-button variant="primary" ?disabled=${ ui.busy || ui.brief.trim().length < 3 }
				@click=${ () => void requestBrandProposal( ctx ) }>${ proposal ? __( 'Generate another proposal' ) : __( 'Propose branding' ) }</os-button>
			<os-button variant="ghost" @click=${ () => closeBrandAi( ctx ) }>${ __( 'Cancel' ) }</os-button>
		</div>
		${ ui.busy ? html`<p class="os-settings__brand-ai-progress" role="status"><os-spinner preset="inline"></os-spinner>${ __( 'Researching and creating your palette… Your site branding stays unchanged.' ) }</p>` : '' }
		${ ui.error ? html`<os-notice tone="error">${ ui.error }</os-notice>` : '' }
		${ proposal ? html`<div class="os-settings__brand-ai-review">
			<div class="os-settings__brand-heading"><h3>${ proposal.name }</h3><os-badge>${ proposal.webSearch ? __( 'Web search enabled' ) : __( 'No web research' ) }</os-badge></div>
			${ proposal.warning ? html`<os-notice tone="warning">${ proposal.warning }</os-notice>` : '' }
			<div class="os-settings__brand-ai-preview" style=${ previewStyle } aria-label=${ __( 'Proposed brand preview' ) }>
				<div class="os-settings__brand-ai-preview-window"><strong>${ __( 'Your new station' ) }</strong><p>${ __( 'A preview of your surfaces, typography and actions.' ) }</p><os-button variant="primary">${ __( 'Primary action' ) }</os-button></div>
			</div>
			<div class="os-settings__brand-ai-swatches">${ BRAND_ROLES.map( ( role ) => html`<div><span style="background:${ proposal.brandPalette[ role ] }"></span><strong>${ role }</strong><code>${ proposal.brandPalette[ role ].toUpperCase() }</code></div>` ) }</div>
			<p>${ __( 'Font' ) }: ${ proposal.brandFont } · ${ __( 'Widget opacity' ) }: ${ proposal.brandOpacity.widgets }% · ${ __( 'Dock opacity' ) }: ${ proposal.brandOpacity.dock }%</p>
			${ proposal.sources.length ? html`<p>${ __( 'Suggested references' ) }</p><ul>${ proposal.sources.map( ( source ) => html`<li><a href=${ source.url } target="_blank" rel="noopener noreferrer">${ source.title || source.url }</a></li>` ) }</ul>` : '' }
			<os-button variant="primary" @click=${ () => {
				if ( ! available( ctx ) || settings().desktopTheme !== BRAND_THEME_SLUG ) {
					return;
				}
				const current = settings();
				uiOf( ctx ).themes.brandUndo = { brandPalette: { ...current.brandPalette }, brandFont: current.brandFont, brandOpacity: { ...current.brandOpacity }, wallpaper: current.wallpaper };
				update( { brandPalette: proposal.brandPalette, brandFont: proposal.brandFont, brandOpacity: proposal.brandOpacity, wallpaper: 'brand-studio' } );
				closeBrandAi( ctx );
			} }>${ __( 'Apply branding to this site' ) }</os-button>
		</div>` : '' }
	</os-panel>`;
}
