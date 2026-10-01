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
  - Implemented in `theme/coverPresentation.js`, a pure projection from the validated theme and the unchanged cover sample to the chrome values. It covers the full-player backdrop, the mini-player panel, the fullscreen body background, the play-button surface, the white wash (`controlWash`, Gate B) and icon, the dark-foreground decision, and the item-header fill.
  - Under `legacy` it returns exactly the previous expressions, including Black's light-foreground exception.
  - Under `theme` it returns fixed references to `surface.base` (backdrop, panel, body, header) and `surface.raised` (play button).
  - `AudioPlayer.vue` and `pages/item/_id/index.vue` only bind to the projection. A watcher re-syncs the fullscreen body background when the _policy_ changes, so a theme switch while fullscreen can't leave a stale color.
  - Extraction, cover loading and playback code are untouched.

Policies are ordinary enum tokens: invalid values fall back to `standard` / `legacy`, and unknown `presentation.*` keys are ignored. They have no CSS variable, so the serializer never emits them. Dark, Black and Light are `standard` + `legacy`.

## LLAMA (built-in, Phase 2)

LLAMA is an original Audiobookshelf+ theme inspired by the material language of late-1990s blue-gray audio equipment: a steel chassis, recessed black displays, phosphor-green readouts and amber progress. It uses no third-party skin assets, fonts or pixel values.

- It is a built-in like the others (`id: 'llama'`, label `LabelThemeLlama`, `colorScheme: 'dark'`, `equipment` + `theme`). It appears last in Settings through the registry.
- It styles the existing UI only. Layout, geometry, controls and behavior are unchanged.

The equipment recipe (`EQUIPMENT_RULES` in `theme/presets.js`, emitted only under `html[data-theme='llama']`) is **paint-only**: `box-shadow`, `background-image`, `background-color`, `background-clip`, `border-radius`, `color` and `outline`. It never changes border widths, padding, transforms or layout. It covers:

- bevelled chassis on the app bar, bookshelf navigation, dialogs/menus and the drawer, with the selected tab shown as a pressed key plus an accent underline;
- steel buttons over their semantic colors (pressed = inset), bordered icon buttons as steel keys (borderless icon buttons stay bare glyphs), and a steel play button;
- recessed wells for text fields and selects, the Up Next list, and a recessed readout strip behind the fullscreen seek and time rows;
- inset seek channels. The played portion stays amber even after the player's seek code swaps in its settled-state class;
- phosphor-green timestamps, speed readout and playback-method label. Titles and other text stay neutral;
- a thin outer steel frame around player artwork and book-card artwork, drawn outside the image (in list view, around the cover only, not the row);
- a visible accent focus outline;
- Checkpoint F polish, each needed by LLAMA:
  - the bookshelf view's wood material becomes graphite/blue-gray equipment (steel ledge, recessed placards with neutral text); alternative-view placards match;
  - toggle switches get a recessed off slot and a steel thumb. On keeps the success color, state also reads from thumb position, and the disabled thumb reads dimmer than the enabled one;
  - unfinished playback progress bars (cards, list rows, playlist rows, item cover) and the current-chapter marker in Chapters use the amber played-progress token. Finished bars (success) and other yellow uses keep their colors;
  - a contrast safety margin for small uppercase muted headers and inactive navigation icons, using primary text at reduced alpha (6.6:1 and 4.8:1 measured, up from 4.6:1 and 3.05:1).

A test compiles the real content with Tailwind and fails if any recipe selector would be pruned. Tailwind drops selectors whose classes only exist at runtime, such as router-added classes.

### Shared equipment primitives (Phase 2C Gate A)

`theme/presets.js` exports `PRIMITIVES`. Rules are composed from these instead of new one-off values. They are fixed repository values: theme data can't supply or adjust any of them, and they only reference the derived edge colors and the accent token.

- **Light source:** light upper/left edges, dark lower/right edges, drop shadows falling down.
- **Radius scale (`RADIUS`):** `frame` 2px (artwork frames and fine detail), `key` 4px (wells, panels and equipment keys), `round` (circular playback controls only). Every `border-radius` in the recipe must come from this scale; a test enforces it.
- **Elevation (`ELEVATION`):** the only drop shadows rules should use.

  - `raised` (buttons);
  - `panel` (cards and framed artwork);
  - `overlay` (dialogs and menus).

  Each level equals a value existing rules already used, so adopting them changed nothing on screen. A few older shadows (the play button, the Chapters header, the drawer edge, the mini-player and shelf ledge, which mirror their components' own shadows) keep their values until the gate that restyles those surfaces.

- **Edges:** `RAISED_BEVEL`, `PRESSED_BEVEL`, `RECESSED_WELL`, `STEEL_SHEEN`, `PRIMARY_STEEL` / `PRIMARY_STEEL_PRESSED` (the round play button only, Gate B.1), `CHASSIS_SHEEN`, `ARTWORK_FRAME`.
- **`ENGRAVED_SEPARATOR`:** a seam cut into an element's bottom edge, a dark inset line with a faint light return below it. It's drawn inside the element's own box, so row sizes never change. Gate B applies it to the player (transport vs secondary row); queue, chapter, table and dialog rows are later gates. `ENGRAVED_SEPARATOR_TOP` is the same seam on a top edge, and `RECESSED_FACE` is a recessed-display bevel as a background layer (both Gate B).
- **Control states** (complete declaration sets):
  - `KEY_CAP` / `KEY_CAP_PRESSED`: a subtle squared steel face on an existing bare-glyph control's own box, inverted while pressed. It never changes size, placement or touch target. Gate B applies it to the player keys.
  - `SELECTED_KEY`: pressed in (inset bevel plus inner shade) with an accent ring inside the edge. Selection reads as a physical state, not only a color. Not applied yet; Gates C and E consume it.

Semantic hooks: artwork framing targets the generic `card-artwork` class instead of the `book-card-*` id prefix. `LazyBookCard` (whose root is the cover) and the cover box of `LazyListBookCard` carry it. The old id-prefix selector also matched the list card's whole row, so list view used to frame every row. A test checks both templates.

### Full player and mini-player (Phase 2C Gate B)

Paint only. Every player box, control position, size, order and touch target is unchanged. The emulator check found 22 geometry roles with 0 Dark-vs-LLAMA differences, all identical to Gate A, and a 120px mini-player. Dark/Black/Light get no new rules.

- **Artwork:** the player artwork uses the squared `RADIUS.frame` (2px) instead of the fullscreen 16px card radius (mini was 3px). Fullscreen artwork adds `ELEVATION.panel`, so it sits mounted on the chassis. Size, position, crop and aspect ratio are unchanged.
- **Transport deck:** the existing 200px fullscreen bottom panel (`#playerContent`) becomes a raised chassis panel:

  - the `surface.content` fill, `CHASSIS_SHEEN` and `RAISED_BEVEL`;
  - a dark seam above it, against the artwork zone.

  It holds the seek display, transport row and secondary row exactly where they were.

- **Seams:**
  - `ENGRAVED_SEPARATOR` on `#playerControls` divides the transport row from the secondary row;
  - a new mirror primitive, `ENGRAVED_SEPARATOR_TOP`, on the mini-player's seek region divides it from the title/controls zone.
- **Keys:** the new `player-key` hook marks controls that read as physical keys:

  - transport: chapter start/end and both jumps (the jumps are also the mini-player's);
  - secondary row: queue, bookmark, sleep and chapters.

  They get `KEY_CAP` on their own box, and `KEY_CAP_PRESSED` while pressed. A key that is currently unavailable (loading, no next chapter, no chapters) also carries `key-disabled`, next to its existing dimmed glyph. It then has no cap, so it reads flat by shape as well as color. Readouts (speed, sleep countdown) don't fit a cap inside their boxes and stay bare. The invisible podcast bookmark placeholder isn't a key. The play button stays round.

- **Play button:** `coverPresentation` now also returns `controlWash`, which decides whether the button keeps its translucent white wash:

  - `legacy`: `!isLight`, exactly the previous `v-if`;
  - `theme`: `false`.

  The wash sat above the steel sheen and inset bevel and flattened both. The template binds only to the projection; there are no theme-id checks in the player.

  Without the wash, the subtle `STEEL_SHEEN` over the `surface.raised` fill read as dark slate, the same blue-gray as the chassis. Gate B.1 gives the play button (mini and fullscreen) its own stronger primitive, `PRIMARY_STEEL`:

  - an upper-left highlight (same light source as the bevels);
  - a near-opaque top-to-bottom steel falloff composed over the fill.

  The face reads silver-gray, about 112 121 136 behind the glyph. The white glyph keeps at least 3:1, checked against the brightest point, and a test enforces it. Pressed uses `PRIMARY_STEEL_PRESSED`, a dimmer face with an inverted falloff, plus the inset bevel. Secondary keys, buttons and the other steel surfaces keep `STEEL_SHEEN`.

- **Readouts:**
  - The sleep countdown (`sleep-readout` hook) uses the phosphor accent like the other live readouts. This is a presentation mapping; `state.success` still means finished/complete everywhere.
  - The fullscreen seek and total-track wells gain `RECESSED_FACE`, a background-layer bevel that follows `background-clip: content-box` (an inset shadow would span the padding). It adds a dark upper lip with an inner shade and a faint light lower lip.
- **Pending seek:** the seek code's pending state (`bg-yellow-300`, until playback confirms the position) was a near-identical yellow next to the amber played bar. LLAMA draws it as the same amber broken into segments, so it reads as unsettled by pattern, not only by hue. Seek behavior and the class toggling are unchanged.

Palette (approved provisionally at Gate 1; to be judged in combination at Gate 2):

| Token                                              | RGB                               | Role                                                                                                              |
| -------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `surface.recessed`                                 | 10 13 18                          | black-blue display wells                                                                                          |
| `surface.base`                                     | 27 34 46                          | navy/slate chassis: app bar, dialogs, menus                                                                       |
| `surface.content`                                  | 45 55 71                          | medium blue-gray page surface                                                                                     |
| `surface.raised`                                   | 70 82 101                         | lighter steel strips                                                                                              |
| `surface.hover`                                    | 88 102 124                        | steel highlight                                                                                                   |
| `text.default` / `text.primary`                    | 235 238 242 / 226 232 240         | neutral near-white                                                                                                |
| `text.muted`                                       | 150 162 178                       | subdued cool gray                                                                                                 |
| `border.default`                                   | 96 111 134                        | steel edge                                                                                                        |
| `control.toggle` / `-selected`                     | 45 55 71 / 88 102 124             | toggle segments                                                                                                   |
| `progress.track` / `buffered` / `played`           | 40 46 56 / 86 98 116 / 245 190 40 | recessed channel, lighter buffered, yellow-amber played                                                           |
| `accent.primary`                                   | 96 232 104                        | phosphor-green readout/accent                                                                                     |
| `state.*`                                          | shared                            | success, warning, error and info keep their semantic values, so warning orange stays distinct from amber progress |
| derived `--color-edge-light` / `--color-edge-dark` | 153 160 170 / 11 14 18            | bevel edges, fixed blends of `surface.raised` / `surface.base`                                                    |
| `system.*`                                         | 35 35 35, light icons             | the actual native window background; runtime system-bar theming is out of scope                                   |

Known limits at this stage:

- **Startup:** like Black and Light, a saved LLAMA selection is restored asynchronously, so the pre-render loading screen briefly shows the default Dark surface.
- **Non-EPUB reader shell:** it only knows `black`, `dark` and `light`. `engine.readerShellId()` keeps those three and maps any other theme to the shell matching its color scheme, so LLAMA uses the dark shell. The independent EPUB reader theme and `EpubReader.vue` are unchanged.

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
- These stay content-derived for Dark, Black and Light. From Phase 2, a theme opts out with `presentation.cover-color: theme` (LLAMA does); see [Presentation policies](#presentation-policies-phase-2).

## Remaining hardcoded presentation values

These are still hardcoded, by decision, and documented rather than forced into tokens.

- **Tailwind palette classes** (about 170 uses; e.g. `text-white`, `bg-black`, `bg-yellow-400`):
  - white/black text and badges over artwork, which should stay legible whatever the theme;
  - the yellow listening-progress bar on book cards (repainted amber for LLAMA only);
  - `bg-black-400` (not a real class; it has no effect).
- **`assets/app.css`:**
  - `.box-shadow-*` (`#111111xx`);
  - the bookshelf wood and alternative shelf styles (`.bookshelfRow`, `.bookshelfDivider`, `.shinyBlack`, `.altBookshelfLabel`; repainted by the equipment finish);
  - `.default-style a` link color `#5985ff`.
- **Components:**
  - `Modal.vue` top gradient (`from-black`) and white close icon;
  - `LazyBookCard.vue` badge colors (`#78350f`, `#cd9d49dd`);
  - `ToggleSwitch` (repainted by the equipment finish) and `MultiSelect` gray palette classes;
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
