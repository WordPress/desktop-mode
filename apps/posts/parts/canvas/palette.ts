/** Resolve canvas paint from the same inherited tokens as the surrounding controls. */
export interface CanvasPalette {
	surface: number;
	raised: number;
	fg: number;
	muted: number;
	faint: number;
	border: number;
	accent: number;
}

export function readCanvasPalette( host: HTMLElement ): CanvasPalette {
	const probe = document.createElement( 'span' );
	probe.hidden = true;
	host.append( probe );
	const color = ( token: string, fallback: string ): number => {
		probe.style.color = `var(${ token }, ${ fallback })`;
		const rgb = getComputedStyle( probe ).color.match( /[\d.]+/g );
		return rgb && rgb.length >= 3 ? Number( rgb[ 0 ] ) * 65536 + Number( rgb[ 1 ] ) * 256 + Number( rgb[ 2 ] ) : parseInt( fallback.slice( 1 ), 16 );
	};
	const palette = {
		surface: color( '--os-ui-surface', '#ffffff' ),
		raised: color( '--os-ui-surface-elevated', '#ffffff' ),
		fg: color( '--os-ui-fg', '#1d2327' ),
		muted: color( '--os-ui-fg-muted', '#50575e' ),
		faint: color( '--os-ui-fg-faint', '#b0b3b8' ),
		border: color( '--os-ui-border', '#dcdcde' ),
		accent: color( '--os-ui-accent', '#2271b1' ),
	};
	probe.remove();
	return palette;
}

/** Use the more legible theme ink on data-colored count badges. */
export function badgeInk( background: number, palette: CanvasPalette ): number {
	const luminance = ( color: number ): number => [ 16, 8, 0 ].reduce( ( sum, shift, i ) => {
		const c = ( Math.floor( color / 2 ** shift ) % 256 ) / 255;
		return sum + ( c <= .04045 ? c / 12.92 : ( ( c + .055 ) / 1.055 ) ** 2.4 ) * [ .2126, .7152, .0722 ][ i ];
	}, 0 );
	const bg = luminance( background );
	const contrast = ( ink: number ): number => {
		const l = luminance( ink );
		return ( Math.max( l, bg ) + .05 ) / ( Math.min( l, bg ) + .05 );
	};
	return contrast( palette.fg ) >= contrast( palette.surface ) ? palette.fg : palette.surface;
}
