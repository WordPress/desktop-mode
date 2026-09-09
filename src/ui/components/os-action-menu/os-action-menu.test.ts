import { afterEach, describe, expect, it, vi } from 'vitest';
import './os-action-menu';
import type { OsActionMenu } from './os-action-menu';

const tick = async () => {
	await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
};
const trigger = ( el: OsActionMenu ) => el.shadowRoot!.querySelector( 'os-button' )!.shadowRoot!.querySelector( 'button' )!;
const panel = ( el: OsActionMenu ) => el.shadowRoot!.querySelector< HTMLElement >( '.panel' )!;
async function mount() {
	const el = document.createElement( 'os-action-menu' ) as OsActionMenu;
	el.setAttribute( 'label', 'Actions for Ada' );
	el.innerHTML = '<os-context-menu-option data-menu-item-id="profile">Profile</os-context-menu-option><os-context-menu-option heading>Emails</os-context-menu-option><os-context-menu-option disabled>Unavailable</os-context-menu-option><os-context-menu-option data-menu-item-id="reset">Reset</os-context-menu-option>';
	document.body.append( el );
	await tick();
	return el;
}
const key = ( el: HTMLElement, value: string ) => el.dispatchEvent( new KeyboardEvent( 'keydown', { key: value, bubbles: true, composed: true, cancelable: true } ) );
afterEach( () => {
	document.body.replaceChildren(); vi.restoreAllMocks();
} );
describe( '<os-action-menu>', () => {
	it( 'keeps actions hidden until opened and names the native trigger', async () => {
		const el = await mount();
		expect( panel( el ).hidden ).toBe( true );
		expect( panel( el ).getAttribute( 'popover' ) ).toBe( 'manual' );
		expect( trigger( el ).getAttribute( 'aria-label' ) ).toBe( 'Actions for Ada' );
		expect( trigger( el ).getAttribute( 'aria-haspopup' ) ).toBe( 'menu' );
		trigger( el ).click();
		expect( panel( el ).hidden ).toBe( false );
		expect( trigger( el ).getAttribute( 'aria-expanded' ) ).toBe( 'true' );
		await vi.waitFor( () => expect( el.ownerDocument.activeElement ).toBe( el.children[ 0 ] ) );
	} );
	it( 'navigates only available options and restores trigger focus on Escape', async () => {
		const el = await mount();
		key( trigger( el ), 'ArrowUp' );
		await vi.waitFor( () => expect( el.ownerDocument.activeElement ).toBe( el.children[ 3 ] ) );
		key( el.children[ 3 ] as HTMLElement, 'ArrowDown' );
		expect( el.ownerDocument.activeElement ).toBe( el.children[ 0 ] );
		key( el.children[ 0 ] as HTMLElement, 'End' );
		expect( el.ownerDocument.activeElement ).toBe( el.children[ 3 ] );
		key( el.children[ 3 ] as HTMLElement, 'Home' );
		expect( el.ownerDocument.activeElement ).toBe( el.children[ 0 ] );
		key( el.children[ 0 ] as HTMLElement, 'Escape' );
		expect( panel( el ).hidden ).toBe( true );
		expect( trigger( el ).getAttribute( 'aria-expanded' ) ).toBe( 'false' );
		expect( ( trigger( el ).getRootNode() as ShadowRoot ).activeElement ).toBe( trigger( el ) );
	} );
	it( 'closes before delivering a picked action to the caller', async () => {
		const el = await mount();
		const picked = vi.fn( ( e: Event ) => {
			expect( panel( el ).hidden ).toBe( true );
			expect( ( e as CustomEvent ).detail.id ).toBe( 'reset' );
		} );
		el.addEventListener( 'os-context-menu-pick', picked );
		el.show();
		( el.children[ 3 ] as HTMLElement ).click();
		expect( picked ).toHaveBeenCalledOnce();
	} );
	it( 'dismisses on outside pointer, focus, scroll, Tab and disconnection', async () => {
		const el = await mount();
		el.show();
		document.body.dispatchEvent( new Event( 'pointerdown', { bubbles: true } ) );
		expect( panel( el ).hidden ).toBe( true );
		el.show();
		document.body.dispatchEvent( new FocusEvent( 'focusin', { bubbles: true } ) );
		expect( panel( el ).hidden ).toBe( true );
		el.show();
		document.dispatchEvent( new Event( 'scroll' ) );
		expect( panel( el ).hidden ).toBe( true );
		el.show(); key( el, 'Tab' );
		expect( panel( el ).hidden ).toBe( true );
		el.show(); el.remove();
		expect( panel( el ).hidden ).toBe( true );
	} );
	it( 'clamps near the lower viewport edge and opens above the trigger', async () => {
		const el = await mount();
		vi.spyOn( el, 'getBoundingClientRect' ).mockReturnValue( { left: 1, right: 50, top: window.innerHeight - 30, bottom: window.innerHeight } as DOMRect );
		vi.spyOn( panel( el ), 'getBoundingClientRect' ).mockReturnValue( { width: 180, height: 150 } as DOMRect );
		el.show();
		await vi.waitFor( () => expect( panel( el ).style.left ).toBe( '8px' ) );
		expect( panel( el ).style.top ).toBe( `${ window.innerHeight - 185 }px` );
	} );
} );
