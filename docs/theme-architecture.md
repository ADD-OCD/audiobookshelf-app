# Semantic theme architecture

Phase 1 of Audiobookshelf+ theming. This phase adds a centralized, validated, testable token layer under the existing themes without changing how the app looks or behaves. Later phases can change the appearance deliberately on top of it.

## Goals and scope

- **Presentation only.** Themes may eventually control colors, backgrounds, gradients, borders, shadows, corner radii, typography presets, shipped icon/glyph presets, seek/progress appearance, control styling, artwork treatment and other purely visual indicators.
- Themes **never** rearrange, add, remove or move controls, create alternate layouts, change navigation, or change playback, queue, restoration or download behavior. They never add a volume control. They never execute CSS, JavaScript or HTML, and never load remote resources.
- A theme is **validated data**, not a stylesheet.

## Pieces

| File                                       | Role                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `theme/tokens.js`                          | The token schema: semantic name, value type, CSS variable, purpose                                                       |
| `theme/builtins.js`                        | Built-in themes (Dark, Black, Light) as data                                                                             |
| `theme/engine.js`                          | Validation and fallback, the only serializer from data to CSS, theme-id resolution, built-in registry                    |
| `tailwind.config.js`                       | Tailwind plugin that emits each built-in theme's variables at build time; the build fails if a built-in theme is invalid |
| `plugins/theme.client.js`                  | `$theme` service: the one runtime place a theme is applied, persisted and restored                                       |
| `tests/theme.test.mjs`                     | Schema, parity, fallback, security and service tests                                                                     |
| `tests/fixtures/legacy-theme-c7a617bc.css` | The pre-token theme CSS, kept as the parity reference                                                                    |

The three modules under `theme/` are CommonJS on purpose, so the Node build (Tailwind) and the app bundle share one source of truth.

Theme identity (`id`, `labelKey`, `colorScheme`), the semantic tokens, how they are applied, and the persisted selection are kept separate.

## Token model

There are 28 tokens in 10 groups (25 from Phase 1 plus `surface.recessed` and the two `presentation.*` policies from Phase 2; see [Presentation policies](#presentation-policies-phase-2)). Each token names a _purpose_. Its `cssVar` is the CSS custom property the existing Tailwind classes and component styles already use, so no component had to change.

| Group        | Tokens                                                  | CSS variable                                                                                  |
| ------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| surface      | `base`, `content`, `raised`, `hover`, `recessed`        | `--color-primary`, `--color-bg`, `--color-secondary`, `--color-bg-hover`, `--color-recessed`  |
| text         | `default`, `primary`, `muted`                           | `--color-text-default` (the root `color`), `--color-fg`, `--color-fg-muted`                   |
| border       | `default`                                               | `--color-border`                                                                              |
| control      | `toggle`, `toggle-selected`                             | `--color-bg-toggle`, `--color-bg-toggle-selected`                                             |
| progress     | `track`, `buffered`, `played`                           | `--color-track`, `--color-track-buffered`, `--color-track-cursor`                             |
| overlay      | `item-header`, `player`, `mini-player`                  | `--gradient-item-page`, `--gradient-audio-player`, `--gradient-minimized-audio-player`        |
| accent       | `primary`                                               | `--color-accent`                                                                              |
| state        | `success`, `success-strong`, `warning`, `error`, `info` | `--color-success`, `--color-success-dark`, `--color-warning`, `--color-error`, `--color-info` |
| system       | `bar-icons`, `status-bar`, `navigation-bar`             | (applied by the service or natively, not CSS)                                                 |
| presentation | `finish`, `cover-color`                                 | (validated policies; never CSS)                                                               |

The legacy variable names (`--color-bg` means _content_ surface, `--color-primary` means _base_ surface) are kept so that upstream components merge cleanly. The semantic names are the vocabulary for theme data and future work.

Value types:

- `rgb`: `[r, g, b]` integers 0–255, emitted as `r g b` so Tailwind's `/<alpha>` modifiers keep working.
- `overlay`: `{ kind: 'solid', color }` or `{ kind: 'linear', angle: 0–360, stops: [{ color: [r,g,b] | [r,g,b,a], at: 0–100 }] }` with 2–8 stops.
- `enum`: one of a fixed list.

## Built-in themes

`dark` (the default and the fallback), `black` and `light` are plain objects in `theme/builtins.js`. Their values reproduce the pre-token CSS exactly. That includes the status colors, which were previously fixed hex values in `tailwind.config.js` and are now variables with the same values in every theme.

The Tailwind plugin emits:

- `:root { … }` for Dark;
- `html[data-theme='black'] { … }` and `html[data-theme='light'] { … }` for the others.

The CSS is therefore present at first paint and costs nothing at runtime. The persisted value (Preferences key `theme`) and the `data-theme` attribute keep their existing values, so saved selections carry over.

## Presentation policies (Phase 2)

Phase 2 adds one semantic color and two validated policies.

- **`surface.recessed`**: sunken display/readout wells. Dark, Black and Light carry their `surface.base` value for schema completeness. Nothing in the standard themes consumes it, so their appearance is unchanged; the only change to their compiled CSS is the one new variable.
- **`presentation.finish`** (`standard` | `equipment`) selects a **fixed, repository-owned recipe** in `theme/presets.js`.
  - `standard` produces no rules at all.
  - `equipment` is a fixed set of rules, emitted at build time under the theme's own `html[data-theme='<id>']` root.
  - Selectors and property names live in code. Values reference only token variables, plus two edge colors (`--color-edge-light`, `--color-edge-dark`) derived from validated surfaces with fixed blend factors.
  - Theme data cannot supply selectors, properties, shadows, gradients, dimensions, URLs, paths or blend factors.
- **`presentation.cover-color`** (`legacy` | `theme`):
  - `legacy` keeps player and item chrome tinted from cover art (existing behavior).
  - `theme` makes that chrome use the theme palette instead. The cover art itself is untouched.
  - Consumed from Checkpoint C onward.

Policies are ordinary enum tokens: invalid values fall back to `standard` / `legacy`, and unknown `presentation.*` keys are ignored. They have no CSS variable, so the serializer never emits them. Dark, Black and Light are `standard` + `legacy`.

## Validation and fallback

- `validateTokens(input, fallback)` reads only schema tokens, and only as own properties.
  - Missing or invalid values take the fallback (default theme) value and are reported.
  - Unknown keys are ignored and reported.
  - Non-plain objects fall back entirely.
  - It never throws.
- `validateTheme` also checks identity: the `id` pattern `^[a-z][a-z0-9-]{0,31}$`, a label key, and a `colorScheme` of `dark` or `light`. A theme with invalid identity is unusable.
- `resolveThemeId(value)` maps any stored or requested value to a built-in id. Unknown, empty, non-string or prototype-named values resolve to `dark`. This matches the old behavior, where an unknown attribute simply fell back to the `:root` (Dark) CSS.
- Built-in theme data is deep-frozen at runtime. A built-in that fails validation fails the build.

## How tokens reach the UI

1. **Build time:** `builtinThemeRules()` → Tailwind `addBase` → the CSS variables → existing Tailwind classes (`bg-bg`, `text-fg`, `bg-success/10`, …) and component styles (`rgb(var(--color-track))`).
2. **Runtime:** `$theme.apply(id)` sets `<html data-theme>` to a validated id and applies the system-bar icon style. `$theme.select(id)` also persists the choice. `$theme.restore()` runs at startup, and `$theme.ready` resolves once the saved selection is applied.
   - Settings lists themes from the registry (same order and labels as before) and calls `select`.
   - `init.client.js` no longer writes the attribute or the status-bar style itself.

## System bars

Findings:

- Under edge-to-edge (targetSdk 36), `MainActivity` offsets the WebView by the system-bar insets. The areas behind the status and navigation bars show the native activity background: `AppTheme.NoActionBar` → `@color/background_dark` (`#232323`).
- `window.statusBarColor` and Capacitor's `StatusBar.setBackgroundColor` have no effect on Android 15+. The bars are therefore `#232323` with light icons in **every** theme, including Light.
- Before this phase, the icon style was set unconditionally to light icons at startup.

Phase 1 status:

- `system.bar-icons`, `system.status-bar` and `system.navigation-bar` are recorded per theme with the current values (`light`, `#232323`, `#232323`). A test keeps them equal to `colors.xml`.
- The `$theme` service applies the icon style from the token, which is the same light-icon style as before, so nothing changes on screen.
- **Deferred (native work):** applying the bar colors at runtime needs a small native method. It would set the activity root/decor background, set `WindowInsetsControllerCompat` light/dark bar appearance, and persist the last colors natively so the next cold start doesn't flash. That would let Light use light bars with dark icons. It changes Light's appearance, so it belongs to a later phase, with S22 Ultra testing across Android versions. Layout and inset handling must not change when it is added.

## Typography findings

- **Declared:** `tailwind.config.js` sets `sans: 'Source Sans Pro', …defaults` and `mono: 'Ubuntu Mono', …defaults`. `assets/fonts.css` declares Source Sans Pro (Light, Regular, SemiBold) and Ubuntu Mono (Regular) from `static/fonts/` (OFL/UFL licensed files). It also declares the Material Symbols Rounded and absicons icon fonts.
- **Actual (verified in the Android WebView):**
  - Only the two icon fonts are registered.
  - All 27 text `@font-face` rules use `format('ttf')`, which is not a valid format hint (the valid one is `truetype`), so the browser discards them. The files themselves are served fine.
  - Text renders in the next family in the stack, `system-ui` (**Roboto** on Android).
  - Monospace renders in the system monospace font.
  - Bold is synthesized or taken from Roboto.
- **Phase 1 keeps this unchanged:** Roboto _is_ the current appearance. Fixing the format hint would visibly change every screen, so it is a deliberate later decision.
- **Scripts:**
  - Roboto covers Latin (including Slovak diacritics), Cyrillic and Greek.
  - Android's system fallback supplies Noto Naskh Arabic, Noto Sans Hebrew and Noto Sans CJK/Korean per glyph.
  - Source Sans Pro, if loaded, would also cover Slovak, but not Arabic, Hebrew or Korean. Those would still fall back per glyph, provided the stack ends in a generic family.
  - The app does not set `dir="rtl"` for Arabic or Hebrew; layout mirroring is out of scope for theming.
- **Future font presets** must:
  - use only bundled fonts or system families (no URLs);
  - always end in a generic family (`sans-serif` / `monospace`) so unsupported scripts fall back instead of rendering as boxes;
  - apply display or decorative fonts only to limited roles, never to body text;
  - use `font-display: swap` and a correct format hint.

## Content-derived color (intentionally not tokens)

- **Player and mini-player background:** the average color of the cover art (`utils/coverAverageColor.js`), with `coverBgIsLight` choosing dark or light icon colors. The theme overlays (`overlay.player`, `overlay.mini-player`) sit on top of it.
- **Item page header:** the same cover-average color, under `overlay.item-header`.
- These stay content-derived. A future theme could _opt out_ of them (for example a `player.background: theme` flag), but Phase 1 keeps them as they are.

## Remaining hardcoded presentation values

These are still hardcoded, by decision, and documented rather than forced into tokens.

- **Tailwind palette classes** (about 170 uses; e.g. `text-white`, `bg-black`, `bg-yellow-400`):
  - white/black text and badges over artwork, which should stay legible whatever the theme;
  - the yellow listening-progress bar on book cards;
  - `bg-black-400` (not a real class; it has no effect).
- **`assets/app.css`:**
  - `.box-shadow-*` (`#111111xx`);
  - the bookshelf wood and alternative shelf styles (`.bookshelfRow`, `.bookshelfDivider`, `.shinyBlack`, `.altBookshelfLabel`);
  - `.default-style a` link color `#5985ff`.
- **Components:**
  - `Modal.vue` top gradient (`from-black`) and white close icon;
  - `LazyBookCard.vue` badge colors (`#78350f`, `#cd9d49dd`);
  - `ToggleSwitch`/`MultiSelect` gray palette classes;
  - `vue-toastification` default CSS.
- **Theme-id conditionals:**
  - `AudioPlayer.vue` (`theme !== 'black'`), which reads the attribute non-reactively;
  - `TextInput.vue` (Light time-picker icon invert).
- **Kept separate on purpose:**
  - the readers (`Reader.vue`, `EpubReader.vue`) have their own ebook reader theme;
  - year-in-review canvas colors are share images.
- **Native Android:**
  - `styles.xml`/`colors.xml` `#232323` (window and system bars);
  - the widget (`MediaPlayerWidgetTheme` `#232323`/`#373838`, `widget_button_bg.xml`);
  - the splash screen, the media notification and the native `Dialog` alerts, which follow the system day/night mode.

## Security model and trust boundary

- **Trusted:** code in this repository, including `theme/builtins.js`, which is reviewed like any code.
- **Untrusted (future):** any theme data that does not come from the repository, such as imported or user-edited themes.
  - It must pass `validateTheme`.
  - It never reaches CSS except through `themeDeclarations`, which re-validates every value and serializes only integers, fixed-range numbers and fixed keywords into a fixed set of property names.
  - Selectors are built only from ids matching the id pattern.
- Consequences, each covered by tests:
  - **No CSS injection:** values can't contain `;`, `{`, `}`, quotes, `url(`, `@import`, `expression` or backslashes.
  - **No HTML/JS injection:** theme text is never inserted as markup, and labels are i18n keys, not free text.
  - **No remote loading, URLs or file paths:** the schema has no such fields.
  - **No prototype pollution:** only own schema properties are read.
  - **No unrestricted fonts:** no font fields exist yet, and future presets must be enums over bundled or system families.
- The persisted selection is only an id, resolved against built-ins.

## Future work (not implemented)

- **Imported/user themes:** a versioned JSON format (`format`, `version`, `metadata`, `base`, `tokens`), validated with `validateTheme` against the default theme, with size and depth limits, and flattened when exported.
  - Runtime application would add one `<style>` element whose text comes only from `toCssText({ [themeSelector(id)]: themeDeclarations(tokens) })` for a validated id and validated tokens.
  - Import and export would reuse the diagnostics Save-to-device pattern. Nothing arbitrary is ever executed.
- **Follow Device/System provider:** a token _provider_ that picks or derives a theme from the Android system light/dark setting. It plugs into `ThemeService` (for example `apply(provider.resolve())`), not into components. It must re-apply when the system appearance changes.
- **Material You / dynamic colors:** investigate reading Android 12+ dynamic colors through a small native method and mapping them onto the semantic tokens, with contrast checks.
- **Samsung One UI / Galaxy Themes:** investigate what, if anything, Galaxy Themes exposes to third-party apps beyond the standard system appearance and dynamic colors. No compatibility is claimed.
- See `docs/future-work.md`.
