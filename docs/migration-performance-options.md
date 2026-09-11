# Performance settings move to Extended options

Window preloading and shared asset caching are enabled by default and
controlled site-wide in **Preferences → Features → Extended options**.
Administrators can disable either feature; changes take effect when each
OpenStation shell reloads.

## Stored values

`desktop_mode_extended_options` has two boolean fields:

- `window_prewarm`: defaults to `true`.
- `admin_asset_cache`: defaults to `true`.

Missing keys enable the feature, including on existing installations.
Explicit site-wide `false` values survive partial saves. Old per-user
`windowPrewarmEnabled` and `adminAssetCacheEnabled` values no longer control
either feature. There is no automatic conversion of individual preferences
into a site-wide opt-out.

## Integrations

`wp.os.getOsSettings()` retains both camelCase fields as read-only mirrors
for existing consumers. `wp.os.updateOsSettings()` ignores patches to
those fields, and `wp.os.resetOsSettings()` preserves their current values.
Integrations that wrote these preferences must use the administrator-only
`POST /desktop-mode/v1/extended-options` route with an `options` object,
for example `{ "options": { "window_prewarm": false } }`.

The `openstation_pwa_admin_asset_cache` filter remains available and
receives the site-wide option as its default. Returning `false` vetoes the
cache. The shell posts the resolved flags to the running service worker
on boot; changing an option does not change the served worker bytes.
