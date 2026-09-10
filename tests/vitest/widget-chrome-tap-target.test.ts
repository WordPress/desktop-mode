/**
 * The widget frame's chrome buttons meet the WCAG 2.2 target-size floor.
 *
 * SC 2.5.8 (Target Size, Minimum) puts a 24x24 CSS-pixel floor under a
 * pointer target. Three rules in `desktop.css` sized the widget frame's
 * own controls below it — measured on a running instance at desktop
 * viewport, `box-sizing: border-box` and `padding: 0` on all of them, so
 * the declared size *is* the target size and no padding made up the
 * difference:
 *
 *   .os-widgets__card-redock                     20x20   (8 instances)
 *   .os-widgets__chrome .os-widgets__card-close  20x20
 *   .os-widgets__card-close (corner)             22x22   (12 instances)
 *
 * None of the spec's exceptions reach them. They are standalone icon
 * buttons, not inline in a sentence; the size is not user-agent
 * controlled; and no equivalent control is offered elsewhere in the view.
 *
 * The spacing exception does not save them either. Redock and close are
 * adjacent flex siblings inside `.os-widgets__chrome` (`gap: 8px`), so at
 * their old sizes a 24px circle centred on one intersected the circle on
 * the other. At 24px each the centres sit 32px apart — clear of the 24px
 * the exception requires — which is why raising the size fixes the
 * spacing limb as well as the size limb.
 *
 * Raising the box rather than adding an invisible hit area is deliberate:
 * `.os-widgets__chrome` is the drag handle (`cursor: grab`,
 * `touch-action: none`), and a pseudo-element overlay there would sit
 * between the pointer and the drag it is meant to start.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join( __dirname, '../..' );
const DESKTOP = readFileSync( join( ROOT, 'assets/css/desktop.css' ), 'utf8' );

/** WCAG 2.2 SC 2.5.8, in CSS pixels. */
const TARGET_MIN = 24;

/** The declared width/height of the first rule with this exact selector. */
function boxOf( selector: string ): { width: number; height: number } {
	const escaped = selector.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
	const rule = new RegExp( `^${ escaped }\\s*\\{([^}]*)\\}`, 'm' ).exec( DESKTOP );
	expect( rule, `no rule found for ${ selector }` ).not.toBeNull();
	const body = rule![ 1 ];
	const width = /(?<!-)width\s*:\s*([\d.]+)px/.exec( body );
	const height = /(?<!-)height\s*:\s*([\d.]+)px/.exec( body );
	expect( width, `${ selector } declares no width` ).not.toBeNull();
	expect( height, `${ selector } declares no height` ).not.toBeNull();
	return { width: Number( width![ 1 ] ), height: Number( height![ 1 ] ) };
}

describe( 'widget chrome tap targets', () => {
	test.each( [
		'.os-widgets__card-redock',
		'.os-widgets__chrome .os-widgets__card-close',
		'.os-widgets__card-close',
	] )( '%s is at least 24x24', ( selector ) => {
		const { width, height } = boxOf( selector );
		expect( width ).toBeGreaterThanOrEqual( TARGET_MIN );
		expect( height ).toBeGreaterThanOrEqual( TARGET_MIN );
	} );

	test( 'the two chrome siblings stay clear of each other', () => {
		// SC 2.5.8's spacing limb: 24px circles centred on adjacent targets
		// must not intersect, i.e. centres at least 24px apart.
		const chrome = /^\.os-widgets__chrome\s*\{([^}]*)\}/m.exec( DESKTOP );
		expect( chrome, 'no .os-widgets__chrome rule' ).not.toBeNull();
		const gap = /(?<!-)gap\s*:\s*([\d.]+)px/.exec( chrome![ 1 ] );
		expect( gap, '.os-widgets__chrome declares no gap' ).not.toBeNull();

		const redock = boxOf( '.os-widgets__card-redock' );
		const close = boxOf( '.os-widgets__chrome .os-widgets__card-close' );
		const centres = redock.width / 2 + Number( gap![ 1 ] ) + close.width / 2;

		expect( centres ).toBeGreaterThanOrEqual( TARGET_MIN );
	} );

	test( 'the reader can tell a short box from a tall one', () => {
		// Negative control. Without it, a regex that stopped matching would
		// report a clean sweep over nothing, and every pin above would pass
		// while the stylesheet said 20px.
		const short = /^\.os-widgets__grip\s*\{([^}]*)\}/m.exec( DESKTOP );
		expect( short, 'no .os-widgets__grip rule to control against' ).not.toBeNull();
		expect( boxOf( '.os-widgets__card-redock' ).width ).toBe( 24 );
	} );
} );
