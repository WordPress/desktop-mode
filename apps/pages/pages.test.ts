/**
 * Pages app — the Posts list body composed for pages: every string
 * picks the page noun, the hierarchical columns paint, the declared
 * sort is the fallback, and there are no taxonomy tabs or cells.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockViewContext } from '../../src/app-runtime/testing';
import type { ListData, ListState, PostListItem } from '../posts/parts/types';
import app from './pages.os';

function row( id: number, over: Partial< PostListItem > = {} ): PostListItem {
	return {
		id,
		title: { rendered: `Page ${ id }` },
		status: 'publish',
		date: '2026-01-01T00:00:00',
		date_gmt: '2026-01-01T00:00:00',
		modified: '2026-01-01T00:00:00',
		modified_gmt: '2026-01-01T00:00:00',
		author: 1,
		categories: [],
		tags: [],
		comment_status: 'open',
		parent: 0,
		template: '',
		slug: `page-${ id }`,
		...over,
	};
}

function mount( items: PostListItem[] ) {
	const root = document.createElement( 'div' );
	document.body.appendChild( root );
	const dispatch = vi.fn( async () => true );
	const ctx = mockViewContext< ListState, ListData >( {
		state: { page: 1, perPage: 20, search: '', status: '', orderby: 'menu_order', order: 'asc', author: [], tag: [] },
		data: { list: { items, total: items.length, pages: items.length ? 1 : 0, page: 1, perPage: 20, error: '', code: '' } },
		root,
		extra: {
			mode: 'pages',
			newPostUrl: 'http://x.test/wp-admin/post-new.php?post_type=page',
			defaultOrderby: 'menu_order',
			defaultOrder: 'asc',
			frontPageId: 1,
			pageTemplates: { '': 'Default template' },
		},
		dispatch,
		host: { fetch: ( i, init ) => globalThis.fetch( i, init ), openUrl: vi.fn(), confirm: vi.fn( async () => true ) },
	} );
	ctx.repaint = () => app.render( ctx );
	app.render( ctx );
	return { root, ctx, dispatch };
}

beforeEach( () => {
	( window as unknown as { wp?: unknown } ).wp = {
		os: { getOsSettings: () => ( { nativePostsHiddenColumns: [] } ) },
		hooks: { applyFilters: ( _n: string, v: unknown ) => v, doAction: () => undefined },
	};
} );

afterEach( () => {
	document.body.replaceChildren();
	delete ( window as unknown as { wp?: unknown } ).wp;
} );

describe( 'the pages view', () => {
	it( 'has the pages and atlas tabs, no taxonomy tabs, and reads as pages everywhere', () => {
		const { root, ctx } = mount( [ row( 1 ), row( 2 ) ] );
		expect( Array.from( root.querySelectorAll( 'os-tab' ) ).map( ( tab ) => tab.textContent ) ).toEqual( [ 'All pages', 'Page atlas' ] );
		expect( root.querySelector( '[data-os-pages-atlas]' )?.childElementCount ).toBe( 0 );
		expect( root.querySelector( '[data-os-posts-root]' )!.classList.contains( 'desktop-mode-pages' ) ).toBe( true );
		expect( root.querySelector( '[data-os-posts-search]' )!.getAttribute( 'placeholder' ) ).toBe( 'Search pages…' );
		expect( root.querySelector( '.os-app-list__pager' ) ).toBeNull();
		expect( root.querySelector( '[data-content-feed-end]' )?.textContent ).toContain( 'caught up' );
		expect( root.querySelector( '.os-app-list__empty p' )!.textContent ).toBe( 'No pages found.' );
		( root.querySelector( '[data-os-posts-new]' ) as HTMLElement ).click();
		expect( ctx.host.openUrl ).toHaveBeenCalledWith( 'http://x.test/wp-admin/post-new.php?post_type=page', 'Add New Page', 'dashicons-admin-page' );
	} );

	it( 'paints the hierarchical columns, sorted by menu order, and falls back to it when a sort is cleared', () => {
		const { root, dispatch } = mount( [ row( 1 ), row( 2, { parent: 1 } ) ] );
		const table = root.querySelector( '[data-os-posts-table]' ) as HTMLElement & {
			columns?: Array< { key: string } >;
			sort?: { key: string; direction: string } | null;
		};
		expect( ( table.columns ?? [] ).map( ( c ) => c.key ) ).toEqual( [ 'title', 'author', 'parent', 'template', 'slug', 'comments', 'date' ] );
		// `menu_order` is no column, so no header wears a sort arrow —
		// the table refuses a sort it cannot show.
		expect( table.sort ).toBeNull();
		table.dispatchEvent( new CustomEvent( 'os-table-sort-change', { detail: { sort: null } } ) );
		expect( dispatch ).toHaveBeenCalledWith( 'sort', { orderby: 'menu_order', order: 'asc' } );
	} );

	it( 'presents page locations honestly across paginated results', () => {
		const { root } = mount( [ row( 1 ), row( 2, { parent: 1 } ), row( 3, { parent: 90 } ) ] );
		expect( root.querySelector( '[data-story-id="1"] .os-posts-desk__role' )?.textContent ).toBe( 'Front page' );
		expect( root.querySelector( '[data-story-id="2"] .os-posts-desk__kicker' )?.textContent ).toBe( 'Page 1' );
		expect( root.querySelector( '[data-story-id="3"] .os-posts-desk__kicker' )?.textContent ).toBe( 'Parent page #90' );
		( root.querySelector( '[data-inspect-id="2"]' ) as HTMLElement ).click();
		expect( root.querySelector( '[data-detail-field="parent"]' )?.textContent ).toContain( 'Page 1' );
		expect( root.querySelector( '[data-story-id="1"] .os-posts-desk__excerpt' )?.textContent ).toBe( '/page-1' );
		expect( root.querySelector( '.os-posts-desk__workspace' )?.hasAttribute( 'hidden' ) ).toBe( false );
	} );

	it( 'offers public links only for published pages', () => {
		const { root } = mount( [ row( 1, { link: 'https://example.test/home/' } ), row( 2, { status: 'draft', link: 'https://example.test/draft/' } ) ] );
		( root.querySelector( '[data-inspect-id="1"]' ) as HTMLElement ).click();
		expect( root.querySelector( '.os-posts-desk__inspector-actions a' )?.getAttribute( 'href' ) ).toBe( 'https://example.test/home/' );
		( root.querySelector( '[data-inspect-id="2"]' ) as HTMLElement ).click();
		expect( root.querySelector( '.os-posts-desk__inspector-actions a' ) ).toBeNull();
	} );

	it( 'says "No pages" when empty', () => {
		const { root } = mount( [] );
		expect( root.querySelector( '.os-posts-desk__empty h3' )?.textContent ).toBe( 'No pages found.' );
	} );
} );
