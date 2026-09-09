import { css } from '../../../src/ui/core';
export const activityStyles = css`
.os-community__loading { max-inline-size: 520px; padding: 48px 24px; margin: 40px auto; text-align: center; color: var( --os-ui-fg, #1d2327 ); }
.os-community__loading > .dashicons { font-size: 40px; inline-size: 40px; block-size: 40px; color: var( --os-ui-fg-muted, #646970 ); }
.os-community__loading h3 { font-size: 24px; font-weight: 500; color: inherit; }
.os-community__loading p { font-size: 12px; line-height: 1.7; color: var( --os-ui-fg-muted, #646970 ); }
.os-community__loading os-progress-bar { display: block; margin-block: 24px 12px; }

.os-community { padding: 22px 24px 8px; max-inline-size: 1440px; margin-inline: auto; }
.os-community__metrics { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; margin-block-end: 20px; }
.os-community__metric { display: grid; grid-template-columns: auto 1fr; column-gap: 14px; row-gap: 8px; padding: 18px; border: 1px solid var( --os-ui-border, #dcdcde ); border-radius: 14px; background: var( --os-ui-surface, #fff ); }
.os-community__metric > .dashicons { grid-column: 1 / -1; color: var( --os-ui-fg-muted, #646970 ); font-size: 18px; }
.os-community__metric strong { font-size: 38px; font-weight: 500; line-height: 1; letter-spacing: -.05em; font-variant-numeric: tabular-nums; align-self: center; }
.os-community__metric h3 { margin: 0 0 3px; font-size: 12px; color: inherit; }
.os-community__metric p { margin: 0; font-size: 10px; line-height: 1.5; color: var( --os-ui-fg-muted, #646970 ); }
.os-community__grid { display: grid; grid-template-columns: minmax(0,1.35fr) minmax(0,1fr); gap: 20px; align-items: start; }
.os-community__panel { min-inline-size: 0; padding: 24px; border: 1px solid var( --os-ui-border, #dcdcde ); border-radius: 18px; background: var( --os-ui-surface, #fff ); }
.os-community__panel > header { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-block-end: 16px; }
.os-community__panel h3 { margin: 5px 0 0; font-size: 22px; font-weight: 500; letter-spacing: -.035em; line-height: 1.15; color: inherit; }
.os-community__eyebrow { font-size: 9px; letter-spacing: .13em; color: var( --os-ui-fg-muted, #646970 ); }
.os-community__stamp { font-size: 32px; font-weight: 300; color: var( --os-ui-accent, #2271b1 ); }
.os-community__totals { margin-block: 6px 18px; }
.os-community__totals > div { display: flex; align-items: baseline; gap: 10px; }
.os-community__totals strong { font-size: clamp(40px,4.8cqi,60px); line-height: 1; font-weight: 500; letter-spacing: -.06em; font-variant-numeric: tabular-nums; }
.os-community__totals span { font-size: 13px; }
.os-community__totals p, .os-community__description { font-size: 11px; line-height: 1.6; color: var( --os-ui-fg-muted, #646970 ); margin: 9px 0 0; }
.os-community__work os-segmented { display: flex; margin-block-end: 18px; }
.os-community__work os-segment { flex: 1; }
.os-community__spotlight { display: flex; gap: 14px; align-items: center; padding: 18px; border-radius: 12px; background: var( --os-ui-surface-sunken, #f6f7f7 ); border-inline-start: 3px solid var( --os-ui-accent, #2271b1 ); }
.os-community__spotlight > div { flex: 1; min-inline-size: 0; }
.os-community__person { display: block; max-inline-size: 100%; --os-ui-button-padding: 0; }
.os-community__person::part(button) { padding: 0; min-block-size: 0; border: 0; background: transparent; color: var( --os-ui-fg, #1d2327 ); font-size: 13px; font-weight: 600; line-height: 1.3; text-align: start; white-space: normal; overflow-wrap: anywhere; }
.os-community__spotlight .os-community__person { margin-block: 4px; }
.os-community__spotlight .os-community__person::part(button) { font-size: 19px; letter-spacing: -.025em; }
.os-community__spotlight p { font-size: 10px; color: var( --os-ui-fg-muted, #646970 ); margin: 0; }
.os-community__spotlight > strong { text-align: end; font-size: 30px; font-weight: 500; line-height: 1; font-variant-numeric: tabular-nums; }
.os-community__spotlight small { display: block; font-size: 9px; font-weight: 400; margin-block-start: 6px; color: var( --os-ui-fg-muted, #646970 ); }
.os-community__leaders { list-style: none; padding: 0; margin: 12px 0; }
.os-community__leaders li { display: flex; gap: 12px; align-items: center; padding-block: 9px; }
.os-community__rank { inline-size: 12px; font-size: 10px; color: var( --os-ui-fg-muted, #646970 ); font-variant-numeric: tabular-nums; }
.os-community__leaders li > div { flex: 1; min-inline-size: 0; }
.os-community__leaders li > strong { font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; }
.os-community__track { margin-block-start: 6px; block-size: 4px; border-radius: 4px; overflow: hidden; background: var( --os-ui-surface-subtle, #f0f0f1 ); }
.os-community__track i { display: block; block-size: 100%; border-radius: inherit; background: var( --os-ui-accent, #2271b1 ); }
.os-community__footnote { border-block-start: 1px solid var( --os-ui-surface-subtle, #f0f0f1 ); padding-block-start: 12px; margin: 16px 0 0; font-size: 10px; line-height: 1.6; color: var( --os-ui-fg-muted, #646970 ); }
.os-community__presence-panel { background: radial-gradient(ellipse at 100% 0, var( --os-ui-surface-subtle, #f0f0f1 ), transparent 70%), var( --os-ui-surface, #fff ); }
.os-community__status-dot { color: var( --os-ui-fg-muted, #646970 ); inline-size: 8px; block-size: 8px; border-radius: 50%; background: currentColor; }
.os-community__status-dot[data-online="true"] { color: var( --os-ui-success-fg, #008a20 ); }
.os-community__presence-summary { display: flex; gap: 15px; align-items: center; margin-block: 20px; }
.os-community__presence-summary > strong { display: grid; place-items: center; inline-size: 90px; block-size: 90px; border: 1px solid var( --os-ui-border, #dcdcde ); border-radius: 50%; box-shadow: inset 0 0 0 8px var( --os-ui-surface, #fff ); background: var( --os-ui-surface-sunken, #f6f7f7 ); font-size: 40px; font-weight: 500; }
.os-community__presence-summary p { font-size: 16px; margin: 0; }
.os-community__presence-summary span { display: block; font-size: 11px; color: var( --os-ui-fg-muted, #646970 ); margin-block-start: 6px; }
.os-community__present { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
.os-community__present > div, .os-community__newcomers > div { display: flex; align-items: center; gap: 10px; min-inline-size: 0; }
.os-community__present > div > div, .os-community__newcomers > div > div { min-inline-size: 0; }
.os-community__present p, .os-community__newcomers p, .os-community__timeline p { font-size: 10px; color: var( --os-ui-fg-muted, #646970 ); margin: 4px 0 0; }
.os-community__arrivals h4 { margin: 20px 0 12px; font-size: 11px; font-weight: 600; color: inherit; }
.os-community__arrivals os-histogram { display: block; margin-block-start: 16px; }
.os-community__newcomers { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
.os-community__timeline { padding: 0; margin: 20px 0 0; list-style: none; }
.os-community__timeline li { position: relative; display: flex; gap: 12px; align-items: center; padding-block-end: 19px; }
.os-community__timeline li:not(:last-child)::before { content: ''; position: absolute; inline-size: 1px; inset-inline-start: 16px; inset-block: 34px 0; background: var( --os-ui-border, #dcdcde ); }
.os-community__timeline li > div { flex: 1; min-inline-size: 0; }
.os-community__login-mark { color: var( --os-ui-fg-muted, #646970 ); }
.os-community__empty { margin: 24px 0; padding: 16px; border: 1px dashed var( --os-ui-border, #dcdcde ); border-radius: 10px; font-size: 12px; line-height: 1.6; color: var( --os-ui-fg-muted, #646970 ); }
@container people (min-width: 900px) {
	.os-community__work { grid-column: 1; grid-row: 1 / 3; }
	.os-community__presence-panel { grid-column: 2; grid-row: 1; }
	.os-community__checkins { grid-column: 2; grid-row: 2 / 4; }
	.os-community__arrivals { grid-column: 1; grid-row: 3; }
}
@container people (max-width: 899px) {
	.os-community { padding: 16px; }
	.os-community__metrics { grid-template-columns: repeat(2,minmax(0,1fr)); }
	.os-community__grid { grid-template-columns: 1fr; gap: 14px; }
	.os-community__presence-panel { grid-row: 1; }
	.os-community__present { grid-template-columns: repeat(3,minmax(0,1fr)); }
}
@container people (max-width: 480px) {
	.os-community { padding: 10px 12px; }
	.os-community__metrics { gap: 8px; margin-block-end: 12px; }
	.os-community__metric { gap: 6px 10px; padding: 12px; }
	.os-community__metric > .dashicons { display: none; }
	.os-community__metric strong { font-size: 29px; }
	.os-community__metric h3 { font-size: 11px; }
	.os-community__metric p { font-size: 9px; }
	.os-community__panel { padding: 17px; border-radius: 14px; }
	.os-community__panel h3 { font-size: 20px; }
	.os-community__present, .os-community__newcomers { grid-template-columns: repeat(2,minmax(0,1fr)); }
	.os-community__spotlight { gap: 10px; padding: 12px; flex-wrap: wrap; }
	.os-community__spotlight .os-community__eyebrow { font-size: 8px; }
	.os-community__spotlight .os-community__person::part(button) { font-size: 16px; }
}
`;
