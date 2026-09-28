# Future work

Items noted for later investigation. Nothing here is implemented or scheduled. Each item needs its own authorization before work starts.

## "Follow Device" theming

**Not implemented.** Investigate a theme option that follows the device's appearance. It would be a token provider in the semantic theme architecture added in Phase 1 (`docs/theme-architecture.md`). It plugs into the `$theme` service, not into components, and its output passes the same validation as any theme data.

Scope of the investigation:

- Android system light/dark appearance.
- Material You and Android dynamic colors.
- Samsung One UI integration, including what Samsung Galaxy Themes actually exposes to third-party apps.
- Mapping the supported system appearance values onto Audiobookshelf+ theme tokens.
- It stays presentation-only: no changes to layout, controls or behavior.
- Behavior must be verified on Samsung hardware.

## Runtime system-bar colors

Apply the `system.status-bar`, `system.navigation-bar` and `system.bar-icons` tokens natively, so that for example Light can have light bars with dark icons. Today every theme shows the static `#232323` window background behind the bars. This needs a small native method and cold-start persistence (see "System bars" in `docs/theme-architecture.md`). It is a visible change, so it needs its own phase and S22 Ultra testing.

## Bundled text fonts

Source Sans Pro and Ubuntu Mono never load: their `@font-face` rules use the invalid `format('ttf')`, so the app renders in Roboto and the system monospace font. Fixing the hint would visibly change every screen. Decide deliberately, together with future typography presets that always fall back safely for Arabic, Hebrew and Korean.
