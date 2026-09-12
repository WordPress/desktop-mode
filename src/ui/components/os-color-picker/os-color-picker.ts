/** An inline colour editor: visible alpha, optional HSV detail, no clipped popup. */
import { Component, defineComponent, html } from '../../core';
import { __, sprintf } from '../../../i18n';
import { alphaOf, clamp, fromHsv, toHsv, validColor, withAlpha } from './color';
import { styles } from './os-color-picker.styles';

export class OsColorPicker extends Component {
	static props = [ 'label', 'value' ] as const;
	static styles = [ styles ];
	static help = {
		title: 'Color picker',
		summary: 'RGB / RGBA hex editor with a checkerboard swatch, visible opacity controls and an expandable HSV editor. Updates continuously.',
		status: 'stable',
		props: [
			{ name: 'label', type: 'string', description: 'Visible colour role and accessible control prefix.' },
			{ name: 'value', type: '#RRGGBB or #RRGGBBAA', default: '#000000', description: 'Reflected colour. Opaque edits use six digits; translucent edits use eight.' },
		],
		events: [ { name: 'os-color-change', detail: '{ value: string }', description: 'A valid colour on every edit. Incomplete text remains local until valid.' } ],
		cssProps: [ { name: '--os-ui-border', description: 'Control outlines.' }, { name: '--os-ui-fg', description: 'Control text.' } ],
		example: html`<os-color-picker label="Accent" value="#3858e980"></os-color-picker>`,
	} as const;

	private expanded = false;
	private draft: string | null = null;
	private hue = 0;
	private saturation = 0;
	private brightness = 0;
	private previous = '';

	private color(): string {
		const value = this.getAttribute( 'value' ) || '#000000';
		return validColor( value ) ? value.toLowerCase() : '#000000';
	}

	private commit( value: string ): void {
		this.draft = null;
		this.setAttribute( 'value', value );
		this.emit( 'os-color-change', { value } );
		this.requestUpdate();
	}

	private hsv(): void {
		const value = withAlpha( fromHsv( this.hue, this.saturation, this.brightness ), alphaOf( this.color() ) );
		// Remember the unrounded HSV gesture, including a hue chosen at black.
		this.previous = value;
		this.commit( value );
	}

	private plane( event: PointerEvent ): void {
		const target = event.currentTarget as HTMLElement;
		if ( event.type === 'pointerdown' ) {
			if ( event.button !== 0 ) {
				return;
			}
			target.setPointerCapture( event.pointerId );
		} else if ( ! target.hasPointerCapture( event.pointerId ) ) {
			return;
		}
		const rect = target.getBoundingClientRect();
		if ( ! rect.width || ! rect.height ) {
			return;
		}
		this.saturation = clamp( ( event.clientX - rect.left ) / rect.width );
		this.brightness = 1 - clamp( ( event.clientY - rect.top ) / rect.height );
		this.hsv();
	}

	protected render() {
		const color = this.color();
		if ( color !== this.previous ) {
			this.draft = null;
			const [ hue, saturation, brightness ] = toHsv( color );
			if ( saturation > 0 ) {
				this.hue = hue;
			}
			this.saturation = saturation;
			this.brightness = brightness;
			this.previous = color;
		}
		const label = this.getAttribute( 'label' ) || __( 'Colour' );
		const alpha = Math.round( alphaOf( color ) * 100 );
		const invalid = this.draft !== null && ! validColor( this.draft );
		const name = ( control: string ) => sprintf(
			/* translators: 1: colour role, 2: colour control name. */
			__( '%1$s — %2$s' ), label, control );
		return html`
			<div class="heading"><strong>${ label }</strong><span>${ alpha }%</span></div>
			<div class="entry">
				<button class="swatch" type="button" aria-label=${ name( __( 'Edit colour' ) ) }
					aria-expanded=${ String( this.expanded ) } aria-controls="editor"
					@click=${ () => {
 this.expanded = ! this.expanded; this.requestUpdate();
} }>
					<span class="swatch-color checker" aria-hidden="true"><span style="background: ${ color }"></span></span>
				</button>
				<label class="hex"><span class="sr">${ name( __( 'Hex colour' ) ) }</span>
					<input type="text" maxlength="9" spellcheck="false" autocomplete="off" placeholder="#RRGGBBAA"
					aria-invalid=${ String( invalid ) } aria-describedby=${ invalid ? 'error' : '' }
					.value=${ this.draft ?? color.toUpperCase() }
					@input=${ ( event: Event ) => {
						this.draft = ( event.target as HTMLInputElement ).value.trim();
						if ( validColor( this.draft ) ) {
							this.commit( this.draft.toLowerCase() );
						} else {
							this.requestUpdate();
						}
					} } />
				</label>
			</div>
			<div class="opacity">
				<label for="alpha">${ __( 'Opacity' ) }</label>
				<label class="percent"><span class="sr">${ name( __( 'Opacity percent' ) ) }</span>
					<input type="number" min="0" max="100" step="1" .value=${ String( alpha ) }
						@input=${ ( event: Event ) => {
							const input = event.target as HTMLInputElement;
							if ( input.value !== '' && Number.isFinite( input.valueAsNumber ) ) {
								this.commit( withAlpha( color, clamp( input.valueAsNumber, 100 ) / 100 ) );
							}
						} } /><span>%</span>
				</label>
				<input id="alpha" class="alpha checker" type="range" min="0" max="100" step="1"
					aria-label=${ name( __( 'Opacity' ) ) } .value=${ String( alpha ) }
					style="--_rgb: ${ color.slice( 0, 7 ) }"
					@input=${ ( event: Event ) => this.commit( withAlpha( color, Number( ( event.target as HTMLInputElement ).value ) / 100 ) ) } />
			</div>
			<p id="error" class="error" ?hidden=${ ! invalid }>${ __( 'Use #RRGGBB or #RRGGBBAA.' ) }</p>
			<div id="editor" class="editor" ?hidden=${ ! this.expanded }>
				<div class="plane" aria-hidden="true" style="--_hue: ${ this.hue }"
					@pointerdown=${ ( event: PointerEvent ) => this.plane( event ) }
					@pointermove=${ ( event: PointerEvent ) => this.plane( event ) }>
					<span style="left: ${ this.saturation * 100 }%; top: ${ ( 1 - this.brightness ) * 100 }%"></span>
				</div>
				<label class="channel">${ __( 'Hue' ) }<input class="hue" type="range" min="0" max="359" step="1"
					aria-label=${ name( __( 'Hue' ) ) } .value=${ String( this.hue ) }
					@input=${ ( event: Event ) => {
 this.hue = Number( ( event.target as HTMLInputElement ).value ); this.hsv();
} } /></label>
				<label class="channel">${ __( 'Saturation' ) }<input type="range" min="0" max="100" step="1"
					aria-label=${ name( __( 'Saturation' ) ) } .value=${ String( Math.round( this.saturation * 100 ) ) }
					@input=${ ( event: Event ) => {
 this.saturation = Number( ( event.target as HTMLInputElement ).value ) / 100; this.hsv();
} } /></label>
				<label class="channel">${ __( 'Brightness' ) }<input type="range" min="0" max="100" step="1"
					aria-label=${ name( __( 'Brightness' ) ) } .value=${ String( Math.round( this.brightness * 100 ) ) }
					@input=${ ( event: Event ) => {
 this.brightness = Number( ( event.target as HTMLInputElement ).value ) / 100; this.hsv();
} } /></label>
			</div>`;
	}
}
defineComponent( 'os-color-picker', OsColorPicker );
