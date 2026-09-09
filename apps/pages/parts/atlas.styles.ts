import { css } from '../../../src/ui/core';

export const atlasStyles = css`
.os-page-atlas { display: flex; flex-direction: column; flex: 1; min-inline-size: 0; min-block-size: 0; color: var( --os-ui-fg, #1d2327 ); background: var( --os-ui-surface, #fff ); container: page-atlas / inline-size; }
.os-page-atlas__head { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 20px 24px 16px; }
.os-page-atlas__head h2 { font-size: 29px; font-weight: 500; line-height: 1.1; letter-spacing: -.045em; margin: 0 0 6px; color: inherit; }
.os-page-atlas__head p { font-size: 11px; margin: 0; color: var( --os-ui-fg-muted, #646970 ); }
.os-page-atlas__totals { display: flex; gap: 18px; --os-ui-stat-padding: 0; --os-ui-stat-border: transparent; --os-ui-stat-value-color: var( --os-ui-fg, #1d2327 ); --os-ui-stat-value-size: 26px; }
.os-page-atlas__tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 24px; border-block: 1px solid var( --os-ui-border, #dcdcde ); }
.os-page-atlas__tools os-text-field { flex: 1; min-inline-size: 130px; }
.os-page-atlas__tools os-select { inline-size: 152px; }
.os-page-atlas__main { display: flex; flex: 1; min-block-size: 0; position: relative; overflow: hidden; }
.os-page-atlas__stage { position: relative; flex: 1; min-inline-size: 0; min-block-size: 0; overflow: hidden; touch-action: none; cursor: grab; background-color: var( --os-ui-surface-sunken, #f6f7f7 ); background-image: radial-gradient(circle, var( --os-ui-border, #dcdcde ) .7px, transparent .9px); background-size: 22px 22px; isolation: isolate; }
.os-page-atlas__surface { position: absolute; inset: 0; overflow: hidden; touch-action: none; }
.os-page-atlas__surface:focus-visible { outline: 2px solid var( --os-ui-accent, #2271b1 ); outline-offset: -3px; }
.os-page-atlas__surface.is-panning { cursor: grabbing; user-select: none; }
.os-page-atlas__canvas { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.os-page-atlas__world { position: absolute; inset: 0 auto auto 0; transform-origin: 0 0; z-index: 1; }
.os-page-atlas__sheet { position: absolute; box-sizing: border-box; inline-size: 300px; block-size: 258px; border: 1px solid var( --os-ui-border, #dcdcde ); border-radius: 8px; background: var( --os-ui-surface, #fff ); box-shadow: 0 12px 25px -16px var( --os-ui-fg-muted, #646970 ), 4px 5px 0 -1px var( --os-ui-surface, #fff ), 4px 5px 0 0 var( --os-ui-border, #dcdcde ); }
.os-page-atlas__sheet.is-selected { outline: 2px solid var( --os-ui-accent, #2271b1 ); outline-offset: 4px; }
.os-page-atlas__sheet.is-muted { opacity: .36; }
.os-page-atlas__sheet-head { display: flex; align-items: center; gap: 7px; padding: 6px 9px; block-size: 30px; }
.os-page-atlas__sheet-head > span { color: var( --os-ui-accent, #2271b1 ); font-size: 13px; }
.os-page-atlas__sheet-head os-button { flex: 1; min-inline-size: 0; text-align: start; --os-ui-button-padding: 3px 0; }
.os-page-atlas__sheet-head os-button::part(button) { display: block; inline-size: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: start; }
.os-page-atlas__viewport { position: relative; inline-size: 288px; block-size: 180px; margin-inline: 5px; overflow: hidden; border-radius: 3px; background: var( --os-ui-surface-sunken, #f6f7f7 ); pointer-events: none; }
.os-page-atlas__viewport iframe { position: absolute; inset: 0 auto auto 0; display: block; width: 1440px !important; height: 900px !important; max-width: none !important; max-height: none !important; border: 0; transform: scale(.2); transform-origin: 0 0; pointer-events: none; }
.os-page-atlas__placeholder { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; padding: 20px; font-size: 12px; color: var( --os-ui-fg-muted, #646970 ); background-image: repeating-linear-gradient(transparent 0 21px, var( --os-ui-border-subtle, #f0f0f1 ) 21px 22px); }
.os-page-atlas__sheet-foot { display: flex; justify-content: space-between; gap: 6px; padding: 8px 10px; font-size: 10px; color: var( --os-ui-fg-muted, #646970 ); }
.os-page-atlas__sheet-foot span:first-child { max-inline-size: 210px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.os-page-atlas__directory { flex: 0 0 215px; min-inline-size: 0; padding: 14px; border-inline-start: 1px solid var( --os-ui-border, #dcdcde ); display: flex; flex-direction: column; gap: 12px; }
.os-page-atlas__directory h3 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var( --os-ui-fg-muted, #646970 ); }
.os-page-atlas__list { overflow: auto; flex: 1; min-block-size: 0; display: flex; flex-direction: column; gap: 5px; }
.os-page-atlas__list os-button { display: block; text-align: start; --os-ui-button-padding: 8px 10px; }
.os-page-atlas__list os-button::part(button) { inline-size: 100%; justify-content: space-between; text-align: start; }
.os-page-atlas__list os-button span { font-variant-numeric: tabular-nums; font-size: 10px; color: var( --os-ui-fg-muted, #646970 ); }
.os-page-atlas__list os-button[aria-pressed="true"] { outline: 1px solid var( --os-ui-accent, #2271b1 ); border-radius: 7px; }
.os-page-atlas__selection { font-size: 12px; border-block-start: 1px solid var( --os-ui-border, #dcdcde ); padding-block-start: 10px; }
.os-page-atlas__selection strong { display: block; margin-block-end: 6px; overflow-wrap: anywhere; }
.os-page-atlas__selection p { font-size: 11px; color: var( --os-ui-fg-muted, #646970 ); line-height: 1.6; }
.os-page-atlas__selection os-button { margin-block: 4px; }
.os-page-atlas__legend { display: flex; align-items: center; gap: 14px; padding: 9px 20px; font-size: 10px; color: var( --os-ui-fg-muted, #646970 ); border-block-start: 1px solid var( --os-ui-border, #dcdcde ); flex-wrap: wrap; }
.os-page-atlas__legend span { display: inline-flex; align-items: center; gap: 6px; }
.os-page-atlas__legend i { inline-size: 20px; border-block-start: 2px solid var( --os-ui-accent, #2271b1 ); }
.os-page-atlas__legend .is-link { border-color: var( --os-ui-info, #72aee6 ); }
.os-page-atlas__legend small { margin-inline-start: auto; font-size: inherit; }
.os-page-atlas__zoom { position: absolute; inset-block-end: 14px; inset-inline-start: 14px; z-index: 3; display: flex; align-items: center; gap: 3px; padding: 4px; border: 1px solid var( --os-ui-border, #dcdcde ); border-radius: 9px; background: var( --os-ui-surface, #fff ); }
.os-page-atlas__zoom output { min-inline-size: 42px; font-size: 10px; text-align: center; }
.os-page-atlas__message { padding: 20px; font-size: 12px; color: var( --os-ui-fg-muted, #646970 ); }
.os-page-atlas__refresh .dashicons { inline-size: 16px; block-size: 16px; font-size: 16px; }
.os-page-atlas__browse { display: none; }
@container page-atlas (max-width: 720px) {
	.os-page-atlas__head { padding: 12px; gap: 10px; }
	.os-page-atlas__head h2 { font-size: 21px; }
	.os-page-atlas__head p { display: none; }
	.os-page-atlas__totals { gap: 12px; --os-ui-stat-value-size: 19px; }
	.os-page-atlas__totals os-stat::part(label) { font-size: 8px; }
	.os-page-atlas__tools { padding: 6px 12px; gap: 6px; }
	.os-page-atlas__tools os-text-field { min-inline-size: 85px; }
	.os-page-atlas__refresh { --os-ui-button-padding: 6px; }
	.os-page-atlas__refresh-label { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); }
	.os-page-atlas__tools os-select { inline-size: 108px; }
	.os-page-atlas__browse { display: block; }
	.os-page-atlas__directory { display: none; }
	.os-page-atlas.is-browsing .os-page-atlas__directory { display: flex; flex: 1; border: 0; }
	.os-page-atlas.is-browsing .os-page-atlas__stage, .os-page-atlas.is-browsing .os-page-atlas__zoom { display: none; }
	.os-page-atlas__legend { padding: 7px 12px; gap: 8px; }
	.os-page-atlas__legend small { display: none; }
}
`;
