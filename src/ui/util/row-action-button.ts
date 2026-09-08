/**
 * A row-action button for a table cell: a glyph (and optionally its
 * label) in a bordered square that swaps to the hover wash under the
 * pointer or keyboard focus.
 *
 * Shared by every app that paints actions into an `<os-table>` row
 * (the Recycle Bin's restore / delete, the Users list's password
 * reset / welcome email). It exists because `<os-table>` renders its
 * body into a shadow root that document stylesheets never reach:
 * every visual property has to be an inline `style.*`, and every
 * colour an inline `var()` chain that inherits THROUGH the boundary.
 * Two apps carrying the same forty lines of inline styles drifted
 * once — one set `color: inherit` on a `#fff` fallback and lost its
 * glyphs on the dark palette — so the chains live here, once.
 *
 * The button owns the shell; the caller owns the glyph. An
 * `<os-icon>`, an inline SVG or a themed mask span all work, as long
 * as they draw in `currentColor` so the hover and danger tints reach
 * them.
 */

export interface RowActionButtonOptions {
	/** The accessible name; also the tooltip, and the text when `labelled`. */
	label: string;
	/** The glyph node. Drawn in `currentColor` so state tints reach it. */
	glyph: Node;
	onClick: () => void;
	/** `'danger'` paints the destructive face; anything else is the default. */
	variant?: string;
	/**
	 * Print the label beside the glyph, at a finger's height. A 30px
	 * icon-only square is right in a row on a desk and wrong on a
	 * card under a thumb: too small to hit, and a glyph alone has to
	 * be learned.
	 */
	labelled?: boolean;
}

/**
 * Build the button. Every visual property is inline, the click is
 * bound in place with propagation stopped, and `data-noclick` opts
 * the button out of `os-table-row-click`.
 *
 * Fallback literals are the pre-brand WordPress-admin values — the
 * floor if the stylesheet fails to load, and what the Legacy theme
 * declares.
 */
export function makeRowActionButton( opts: RowActionButtonOptions ): HTMLElement {
	const btn = document.createElement( 'button' );
	btn.type = 'button';
	btn.setAttribute( 'data-noclick', '' );
	btn.setAttribute( 'aria-label', opts.label );
	btn.title = opts.label;

	const isDanger = opts.variant === 'danger';

	const restColor = isDanger
		? 'var( --os-ui-danger, #d63638 )'
		: 'var( --os-ui-fg-muted, #50575e )';
	const restBorder = isDanger
		? 'var( --os-ui-danger, #d63638 )'
		: 'var( --os-ui-border, #c3c4c7 )';
	const restBg = 'var( --os-ui-surface, #fff )';

	const applyRest = (): void => {
		btn.style.background = restBg;
		btn.style.color = restColor;
		btn.style.borderColor = restBorder;
	};
	const applyHover = (): void => {
		if ( isDanger ) {
			btn.style.background = 'var( --os-ui-danger, #d63638 )';
			btn.style.color = 'var( --os-ui-fg-on-accent, #fff )';
			btn.style.borderColor = 'var( --os-ui-danger, #d63638 )';
		} else {
			btn.style.background = 'var( --os-ui-hover, #f0f0f1 )';
			btn.style.color = 'var( --os-ui-fg, #1d2327 )';
			btn.style.borderColor = 'var( --os-ui-border-strong, #8c8f94 )';
		}
	};

	const labelled = opts.labelled === true;
	btn.style.cssText = [
		'display: inline-flex',
		'align-items: center',
		'justify-content: center',
		labelled ? 'gap: 6px' : '',
		labelled ? 'flex: 0 0 auto' : 'flex: 0 0 30px',
		labelled ? 'width: auto' : 'width: 30px',
		labelled ? 'height: 36px' : 'height: 30px',
		labelled ? 'padding: 0 12px' : 'padding: 0',
		labelled ? 'font-size: 13px' : '',
		labelled ? 'font-weight: 600' : '',
		'margin: 0',
		'border: 1px solid ' + restBorder,
		'border-radius: 6px',
		'background: ' + restBg,
		'color: ' + restColor,
		'cursor: pointer',
		'box-sizing: border-box',
		'line-height: 1',
		'font: inherit',
		'transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease',
	].join( ';' );

	btn.addEventListener( 'mouseenter', applyHover );
	btn.addEventListener( 'mouseleave', applyRest );
	btn.addEventListener( 'focus', applyHover );
	btn.addEventListener( 'blur', applyRest );

	btn.appendChild( opts.glyph );

	if ( labelled ) {
		const text = document.createElement( 'span' );
		text.textContent = opts.label;
		text.style.cssText = 'white-space: nowrap; line-height: 1;';
		btn.appendChild( text );
	}

	btn.addEventListener( 'click', ( e: Event ) => {
		e.stopPropagation();
		opts.onClick();
	} );

	return btn;
}
