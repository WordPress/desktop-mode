/** Bounded RGB/HSV helpers for the alpha-aware picker. */
export const validColor = ( value: string ): boolean => /^#[\da-f]{6}([\da-f]{2})?$/i.test( value );
export const clamp = ( value: number, max = 1 ): number => Math.max( 0, Math.min( max, value ) );
export const alphaOf = ( value: string ): number => value.length === 9 ? parseInt( value.slice( 7 ), 16 ) / 255 : 1;

/** Keep opaque values compatible with existing six-digit consumers. */
export function withAlpha( rgb: string, alpha: number ): string {
	const byte = Math.round( clamp( alpha ) * 255 );
	return rgb.slice( 0, 7 ).toLowerCase() + ( byte === 255 ? '' : byte.toString( 16 ).padStart( 2, '0' ) );
}

/** Hue is in degrees; saturation and value are fractions. */
export function toHsv( color: string ): [ number, number, number ] {
	const [ r, g, b ] = [ 1, 3, 5 ].map( ( i ) => parseInt( color.slice( i, i + 2 ), 16 ) / 255 );
	const max = Math.max( r, g, b );
	const delta = max - Math.min( r, g, b );
	let hue = 0;
	if ( delta ) {
		if ( max === r ) {
			hue = ( g - b ) / delta;
		} else if ( max === g ) {
			hue = ( b - r ) / delta + 2;
		} else {
			hue = ( r - g ) / delta + 4;
		}
	}
	return [ ( hue * 60 + 360 ) % 360, max ? delta / max : 0, max ];
}

/** Convert HSV without losing the alpha byte during a colour gesture. */
export function fromHsv( hue: number, saturation: number, value: number ): string {
	const h = ( hue % 360 ) / 60;
	const c = value * saturation;
	const x = c * ( 1 - Math.abs( h % 2 - 1 ) );
	const channels = [ [ c, x, 0 ], [ x, c, 0 ], [ 0, c, x ], [ 0, x, c ], [ x, 0, c ], [ c, 0, x ] ][ Math.floor( h ) ];
	return '#' + channels.map( ( n ) => Math.round( ( n + value - c ) * 255 ).toString( 16 ).padStart( 2, '0' ) ).join( '' );
}
