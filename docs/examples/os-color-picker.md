# Alpha-aware colour picker

*Status: Stable.*

```html
<os-color-picker label="Accent" value="#3858e980"></os-color-picker>
```

The swatch shows the actual alpha over a checkerboard. Hex, opacity slider and
percentage are always visible; the swatch opens an inline HSV editor that stays
inside its container. Native range controls provide keyboard equivalents for the
pointer-operated saturation/brightness plane.

Listen to `os-color-change` with `{ value: string }`. Values are normalized
`#RRGGBB` when opaque and `#RRGGBBAA` when translucent. Valid edits emit immediately;
incomplete hex remains a local draft with an associated error. Setting `value`
updates the picker without emitting a user edit. The consumer decides how to
composite the colour and debounce persistence. The component adds no network calls.

```js
picker.addEventListener( 'os-color-change', ( event ) => {
    preview.style.backgroundColor = event.detail.value;
} );
```
