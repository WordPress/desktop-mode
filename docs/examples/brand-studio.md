# Set this site's Brand Studio palette

Run as a site administrator after the shell settings API is available. The
palette and activation apply to every user on the current site. Other sites in a
multisite network keep their own branding. These settings do not change the
frontend WordPress theme or iframe admin-page styling.

```js
wp.os.updateOsSettings({
    desktopTheme: 'openstation-brand-studio',
    brandFont: 'system',
    brandAllowWallpaper: true, // Each user chooses a personal wallpaper.
    brandOpacity: { widgets: 75, dock: 94 },
    brandPalette: {
        ...wp.os.getOsSettings().brandPalette,
        primary: '#3858e9',
        secondary: '#069eeb',
        highlight: '#9ac9ff',
        canvas: '#101c4b',
        surface: '#ffffff',
        text: '#1e1e1e',
    },
});

// Release site branding. Other users recover their own theme and wallpaper;
// this administrator selects the system theme. The site palette remains saved.
wp.os.updateOsSettings({ desktopTheme: '' });
```

The wallpaper permission is administrator-only and defaults to true. Setting it
to false enforces the matching backdrop without deleting anyone’s personal choice.
Presets do not change this permission.

Requests from users without `manage_options` cannot activate, edit, or disable
the policy. The UI previews administrator edits immediately and saves through
the normal debounced queue. Existing sessions adopt saved changes on Heartbeat.
See [Brand Studio](../desktop-themes.md#brand-studio--experimental).
