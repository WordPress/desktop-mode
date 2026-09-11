import { css } from '../../core';

export const styles = css`
	:host { display: block; min-inline-size: 0; color: var(--os-ui-fg, #1d2327); font: inherit; }
	* { box-sizing: border-box; }
	[hidden] { display: none !important; }
	.heading, .entry, .opacity { display: flex; align-items: center; gap: 10px; }
	.heading { justify-content: space-between; margin-block-end: 12px; font-size: 13px; }
	.heading > span { color: var(--os-ui-fg-muted, #646970); font-variant-numeric: tabular-nums; }
	.checker { background: conic-gradient(#d2d2d2 25%, #fff 0 50%, #d2d2d2 0 75%, #fff 0) 0 0 / 12px 12px; }
	.swatch { position: relative; flex: 0 0 44px; block-size: 44px; padding: 0; border: 1px solid var(--os-ui-fg-muted, #646970); border-radius: 10px; background: var(--os-ui-surface-elevated, #fff); overflow: hidden; cursor: pointer; }
	.swatch:hover, .swatch[aria-expanded=true] { border-color: var(--os-ui-fg, #1d2327); }
	.swatch-color { position: absolute; inset: 4px; border: 1px solid var(--os-ui-border, #c3c4c7); border-radius: 5px; overflow: hidden; }
	.swatch-color > span { position: absolute; inset: 0; }
	.hex { flex: 1; min-inline-size: 0; }
	input { font: inherit; color: inherit; }
	input[type=text] { inline-size: 100%; min-inline-size: 0; block-size: 44px; padding: 8px; border: 1px solid var(--os-ui-border, #c3c4c7); border-radius: 8px; background: var(--os-ui-surface-elevated, #fff); font-family: monospace; font-size: 13px; }
	.opacity { flex-wrap: wrap; justify-content: space-between; margin-block-start: 12px; font-size: 12px; }
	.percent { display: flex; align-items: center; gap: 2px; }
	.percent input { inline-size: 52px; block-size: 32px; padding: 4px; border: 1px solid var(--os-ui-border, #c3c4c7); border-radius: 6px; background: var(--os-ui-surface-elevated, #fff); }
	input[type=range] { inline-size: 100%; min-inline-size: 0; margin: 0; cursor: pointer; accent-color: var(--os-ui-accent, #2271b1); }
	.alpha, .hue { appearance: none; block-size: 16px; border: 1px solid var(--os-ui-border, #c3c4c7); border-radius: 99px; margin-block: 8px !important; direction: ltr; }
	.alpha { background: linear-gradient(90deg, transparent, var(--_rgb)), conic-gradient(#d2d2d2 25%, #fff 0 50%, #d2d2d2 0 75%, #fff 0) 0 0 / 12px 12px; }
	.hue { background: linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
	.alpha::-webkit-slider-thumb, .hue::-webkit-slider-thumb { appearance: none; inline-size: 20px; block-size: 20px; border: 3px solid #fff; border-radius: 50%; background: #333; box-shadow: 0 0 0 1px #555; }
	.alpha::-moz-range-thumb, .hue::-moz-range-thumb { inline-size: 14px; block-size: 14px; border: 3px solid #fff; border-radius: 50%; background: #333; box-shadow: 0 0 0 1px #555; }
	:focus-visible { outline: 2px solid var(--os-ui-accent, #2271b1); outline-offset: 3px; }
	.editor { margin-block-start: 16px; }
	.plane { position: relative; block-size: 132px; border-radius: 8px; background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(var(--_hue) 100% 50%); touch-action: none; cursor: crosshair; }
	.plane span { position: absolute; inline-size: 14px; block-size: 14px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px #333; transform: translate(-50%, -50%); pointer-events: none; }
	.channel { display: grid; gap: 8px; margin-block-start: 12px; font-size: 12px; }
	.error { margin-block: 8px 0; font-size: 12px; color: var(--os-ui-danger, #d63638); }
	.sr { position: absolute; inline-size: 1px; block-size: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap; }
`;
