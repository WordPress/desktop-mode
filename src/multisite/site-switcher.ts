/**
 * The site switcher: on a network, every site is its own OpenStation.
 *
 * A site's shell is a whole instance — its own plugins, native windows,
 * widgets, dock, desktops and session (`openstation_session_meta_key()`
 * keeps one per admin) — so switching site is a navigation to that
 * site's shell screen, animated by the cross-document view transition
 * the shell's stylesheet opts into (`assets/css/desktop.css`). The
 * switcher is a row of segments above the desktop tiles in overview:
 * the network admin, for those who can reach it, then every site the
 * user belongs to, with the current instance selected. Picking another
 * lands in THAT site's overview (`openstation_overview=1`, read once
 * server-side like the boot target), so the panel reads as one surface
 * whose tiles changed.
 *
 * A modifier or middle click on a segment opens the site in a browser
 * tab instead — the universal "open elsewhere" gesture, and the way to
 * stand two sites side by side. See docs/multisite.md.
 *
 * An install that joined from elsewhere (an OpenStation network member,
 * docs/network.md) is marked as external: a mark before its name, a
 * line before the first of them, and the segment's tooltip says so. A
 * user reading the row knows which sites are this network's own.
 */

import type { MultisiteConfig } from '../types';
import { hopToAdmin, wantsBrowserTab, type HopMinter } from './hop';
import { leaveInstance, type HopDirection } from './instance-transition';
import { __ } from '../i18n';
// The switcher is a kit component; the shell bundle registers only
// what it uses, so the definition rides in with its one user.
import '../ui/components/os-segmented/os-segmented';

/**
 * Query arg asking the shell screen to boot straight into overview.
 * Mirrors `OPENSTATION_SHELL_OVERVIEW_ARG`.
 */
export const OVERVIEW_ARG = 'openstation_overview';

/** One instance the switcher offers. */
export interface SiteSwitcherEntry {
	/** `network`, or the blog id as a string — `MultisiteConfig.current`. */
	value: string;
	label: string;
	/** That instance's shell screen. */
	shellUrl: string;
	/** An install that joined from elsewhere, marked as such in the row. */
	external: boolean;
}

/** The direction arg a cross-origin arrival slides in from. Mirrors `OPENSTATION_NETWORK_HOP_FROM_ARG`. */
export const HOP_FROM_ARG = 'openstation_hop_from';

/**
 * The shell URL that boots into overview — and, for another origin,
 * carries the slide direction, since the sessionStorage hint a
 * same-origin switch leaves cannot follow the navigation there.
 */
export function shellUrlInOverview(
	shellUrl: string,
	direction?: HopDirection,
): string {
	try {
		const url = new URL( shellUrl, window.location.href );
		url.searchParams.set( OVERVIEW_ARG, '1' );
		if ( direction && url.origin !== window.location.origin ) {
			url.searchParams.set( HOP_FROM_ARG, direction );
		}
		return url.toString();
	} catch {
		return shellUrl;
	}
}

/** Whether a shell URL lives on another origin than this shell. */
export function isOtherOrigin( shellUrl: string ): boolean {
	try {
		return new URL( shellUrl, window.location.href ).origin !== window.location.origin;
	} catch {
		return false;
	}
}

/**
 * The instances to offer: the network admin first, then the sites in
 * the order the server gave them.
 */
export function siteSwitcherEntries(
	multisite: MultisiteConfig,
): SiteSwitcherEntry[] {
	const entries: SiteSwitcherEntry[] = [];
	if ( multisite.networkAdmin?.shellUrl ) {
		entries.push( {
			value: 'network',
			label: __( 'Network Admin' ),
			shellUrl: multisite.networkAdmin.shellUrl,
			external: false,
		} );
	}
	for ( const site of multisite.sites ?? [] ) {
		entries.push( {
			value: site.id,
			label: site.name,
			shellUrl: site.shellUrl,
			external: site.kind === 'member',
		} );
	}
	return entries;
}

/** The collaborators a switch takes, both optional. */
export interface SiteSwitchDeps {
	/** The navigation; defaults to the same hop every cross-admin click takes. */
	hop?: ( url: string, event?: MouseEvent ) => void;
	/** Signs a login token before a hop to another origin; without it the user logs in there themselves. */
	mint?: HopMinter;
}

/**
 * Switch to another instance of the network by its switcher value: the
 * same hop a pick in the row takes, slide and login token included. The
 * Network window's Open buttons reach it through the `hop` effect the
 * shell handles, so an app switches exactly as the row does and never
 * anywhere the row does not offer. False when the value is unknown, or
 * is this very shell.
 */
export function switchToSite(
	multisite: MultisiteConfig,
	value: string,
	deps: SiteSwitchDeps = {},
): boolean {
	const hop = deps.hop ?? hopToAdmin;
	const entries = siteSwitcherEntries( multisite );
	const current = multisite.current ?? '';
	const to = entries.findIndex( ( x ) => x.value === value );
	if ( to < 0 || value === current ) {
		return false;
	}
	const entry = entries[ to ];
	// Slide this desk out towards the site picked, then go; the shell
	// that arrives slides its desk in from the same side. Another origin
	// gets a login token minted meanwhile, so the user arrives logged
	// in; a mint that fails hops without one.
	const from = entries.findIndex( ( x ) => x.value === current );
	const direction: HopDirection = to > from ? 'next' : 'prev';
	const plain = shellUrlInOverview( entry.shellUrl, direction );
	const minted =
		deps.mint && isOtherOrigin( entry.shellUrl )
			? deps.mint( entry.shellUrl, direction ).catch( () => null )
			: Promise.resolve( null );
	void Promise.all( [ leaveInstance( direction ), minted ] ).then(
		( [ , url ] ) => hop( url ?? plain ),
	);
	return true;
}

/** The mark an external site wears before its name. */
function externalMark(): HTMLElement {
	const mark = document.createElement( 'span' );
	mark.className = 'dashicons dashicons-external os-site-switcher__mark';
	mark.setAttribute( 'aria-hidden', 'true' );
	return mark;
}

/**
 * Build the switcher, or null when there is nothing to switch between:
 * a lone instance is no choice, and a row that only names where the
 * user already stands is noise above their desktops.
 *
 * @param multisite The shell's multisite block.
 * @param deps      Collaborators, both optional; see `SiteSwitchDeps`.
 */
export function buildSiteSwitcher(
	multisite: MultisiteConfig,
	deps: SiteSwitchDeps = {},
): HTMLElement | null {
	const hop = deps.hop ?? hopToAdmin;
	const entries = siteSwitcherEntries( multisite );
	if ( entries.length < 2 ) {
		return null;
	}
	const current = multisite.current ?? '';
	const byValue = new Map( entries.map( ( e ) => [ e.value, e ] ) );

	const group = document.createElement( 'os-segmented' );
	group.className = 'os-site-switcher';
	group.setAttribute( 'label', __( 'Site' ) );
	group.setAttribute( 'value', current );
	let divided = false;
	for ( const entry of entries ) {
		if ( entry.external && ! divided ) {
			// One line, before the first external site: the row reads as
			// this network's sites, then the ones that joined it.
			divided = true;
			const divider = document.createElement( 'span' );
			divider.className = 'os-site-switcher__divider';
			divider.setAttribute( 'role', 'separator' );
			divider.setAttribute( 'aria-orientation', 'vertical' );
			group.appendChild( divider );
		}
		const segment = document.createElement( 'os-segment' );
		segment.setAttribute( 'value', entry.value );
		if ( entry.external ) {
			segment.setAttribute( 'data-external', '' );
			segment.title = __( 'External site' );
			segment.appendChild( externalMark() );
			const spoken = document.createElement( 'span' );
			spoken.className = 'screen-reader-text';
			spoken.textContent = __( 'External site:' ) + ' ';
			segment.appendChild( spoken );
		}
		segment.appendChild( document.createTextNode( entry.label ) );
		group.appendChild( segment );
	}

	// The side-by-side gesture, decided BEFORE the segment's own click
	// turns into a pick: stopped here, the group never re-selects, so
	// the current segment stays lit while the other site opens beside
	// this one. `auxclick` is the middle button, which never fires
	// `click` at all.
	const openBeside = ( e: MouseEvent ): void => {
		if ( ! wantsBrowserTab( e ) ) {
			return;
		}
		const segment = ( e.target as Element | null )?.closest( 'os-segment' );
		const entry = segment
			? byValue.get( segment.getAttribute( 'value' ) ?? '' )
			: undefined;
		if ( ! entry ) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		hop( shellUrlInOverview( entry.shellUrl ), e );
	};
	group.addEventListener( 'click', openBeside, true );
	group.addEventListener( 'auxclick', openBeside, true );

	group.addEventListener( 'os-pick', ( e: Event ) => {
		const value = ( e as CustomEvent< { value?: string } > ).detail?.value;
		if ( value ) {
			switchToSite( multisite, value, deps );
		}
	} );

	return group;
}
