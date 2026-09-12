import { afterEach, expect, test, vi } from 'vitest';
import './os-color-picker';
import { alphaOf, fromHsv, toHsv, withAlpha } from './color';

const tick = async () => {
	await Promise.resolve(); await Promise.resolve();
};
afterEach( () => {
	document.body.innerHTML = '';
} );
async function mount( value = '#3858e980' ) {
	const field = document.createElement( 'os-color-picker' );
	field.setAttribute( 'label', 'Primary' );
	field.setAttribute( 'value', value );
	document.body.append( field );
	const change = vi.fn();
	field.addEventListener( 'os-color-change', change );
	await tick();
	const input = ( selector: string ) => field.shadowRoot!.querySelector< HTMLInputElement >( selector )!;
	return { field, input, change };
}

test( 'shows imported alpha and preserves RGB through zero, partial and full opacity', async () => {
	const { field, input, change } = await mount();
	const range = input( '#alpha' );
	expect( range.value ).toBe( '50' );
	for ( const [ percent, hex ] of [ [ 0, '#3858e900' ], [ 25, '#3858e940' ], [ 100, '#3858e9' ] ] ) {
		range.value = String( percent );
		range.dispatchEvent( new Event( 'input' ) );
		await tick();
		expect( field.getAttribute( 'value' ) ).toBe( hex );
		expect( change.mock.lastCall![ 0 ].detail.value ).toBe( hex );
		expect( input( '#alpha' ) ).toBe( range );
	}
} );

test( 'incomplete hex stays local and never sends an invalid colour to the theme', async () => {
	const { input, change } = await mount();
	const hex = input( '[type=text]' );
	hex.value = '#12';
	hex.dispatchEvent( new Event( 'input' ) );
	await tick();
	expect( hex.value ).toBe( '#12' );
	expect( hex.getAttribute( 'aria-invalid' ) ).toBe( 'true' );
	expect( change ).not.toHaveBeenCalled();
	hex.value = '#11223344';
	hex.dispatchEvent( new Event( 'input' ) );
	await tick();
	expect( change.mock.lastCall![ 0 ].detail.value ).toBe( '#11223344' );
	expect( input( '#alpha' ).value ).toBe( '27' );
} );

test( 'HSV controls preserve alpha and the chosen hue while traversing black', async () => {
	const { field, input } = await mount( '#00000080' );
	field.shadowRoot!.querySelector< HTMLButtonElement >( 'button' )!.click();
	await tick();
	for ( const [ selector, value ] of [ [ '.hue', '120' ], [ '[aria-label="Primary — Saturation"]', '100' ], [ '[aria-label="Primary — Brightness"]', '100' ] ] ) {
		input( selector ).value = value;
		input( selector ).dispatchEvent( new Event( 'input' ) );
		await tick();
	}
	expect( field.getAttribute( 'value' ) ).toBe( '#00ff0080' );
	expect( field.shadowRoot!.querySelector( 'button' )!.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
} );

test( 'external reset updates the swatch and opacity without remounting', async () => {
	const { field, input } = await mount();
	field.setAttribute( 'value', '#ff000000' );
	await tick();
	expect( input( '#alpha' ).value ).toBe( '0' );
	expect( input( '[type=text]' ).value ).toBe( '#FF000000' );
} );

test( 'RGB / HSV round trips include grey and edge hues', () => {
	for ( const hex of [ '#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#3858e9', '#ff00ff' ] ) {
		expect( fromHsv( ...toHsv( hex ) ) ).toBe( hex );
	}
	expect( withAlpha( '#abcdef', 0 ) ).toBe( '#abcdef00' );
	expect( alphaOf( '#abcdef00' ) ).toBe( 0 );
} );

test( 'pointer gestures stay captured across live renders and ignore uncaptured movement', async () => {
	const { field, change } = await mount();
	const plane = field.shadowRoot!.querySelector<HTMLElement>( '.plane' )!;
	let captured = false;
	plane.setPointerCapture = () => {
		captured = true;
	};
	plane.hasPointerCapture = () => captured;
	plane.getBoundingClientRect = () => ( { left: 0, top: 0, width: 100, height: 100 } as DOMRect );
	plane.dispatchEvent( new MouseEvent( 'pointermove', { clientX: 30, clientY: 40 } ) );
	expect( change ).not.toHaveBeenCalled();
	plane.dispatchEvent( new MouseEvent( 'pointerdown', { button: 0, clientX: 30, clientY: 40 } ) );
	await tick();
	expect( change ).toHaveBeenCalledOnce();
	expect( field.shadowRoot!.querySelector( '.plane' ) ).toBe( plane );
	plane.dispatchEvent( new MouseEvent( 'pointermove', { clientX: 100, clientY: 0 } ) );
	await tick();
	expect( change ).toHaveBeenCalledTimes( 2 );
	expect( field.getAttribute( 'value' ) ).toMatch( /80$/ );
} );
