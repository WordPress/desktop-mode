import { css } from '../../core';
export const styles = css`
	:host { display: inline-block; }
	:host([hidden]) { display: none; }
	.panel { position: fixed; inset: auto; margin: 0; padding: 0; border: 0; background: transparent; overflow: visible; max-inline-size: calc(100vw - 16px); }
	.panel[hidden] { display: none; }
	os-context-menu { position: relative; inset: auto; max-inline-size: calc(100vw - 16px); }
	os-button::part(button) { min-block-size: 30px; }
	.chevron { display: inline-block; inline-size: 5px; block-size: 5px; border-inline-end: 1.5px solid currentColor; border-block-end: 1.5px solid currentColor; transform: translateY(-2px) rotate(45deg); margin-inline-start: 5px; vertical-align: middle; }
	:host(:dir(rtl)) .chevron { transform: translateY(-2px) rotate(-45deg); }
`;
