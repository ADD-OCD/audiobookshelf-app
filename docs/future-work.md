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

Source Sans Pro and Ubuntu Mono never load: their `@font-face` rules use the invalid `format('ttf')`, so the app renders in the system sans-serif and monospace fonts (Roboto and Droid Sans Mono on the tested Pixel emulator). This is inherited unchanged from upstream and affects every theme. Phase 2C Gate G verified it at runtime and deferred it; the evidence and measurements are in `docs/theme-architecture.md` ("Typography runtime audit and deferral").

Restoring the bundled fonts is a global typography change, not a LLAMA fix. It would change appearance, weight hierarchy (no Bold is bundled, so 700 becomes SemiBold), readability, text metrics, some content-sized elements and some marquee decisions, and possibly consistency across devices. Decide deliberately, together with future typography presets that always fall back safely for Arabic, Hebrew and Korean.

Options to evaluate (no solution chosen):

- **A.** Correct the existing declarations to valid TrueType hints, keeping the current bundled files.
- **B.** Correct the declarations and add properly licensed missing weights with clear provenance, especially a true Source Sans Pro Bold (700).
- **C.** Convert to or replace with WOFF2, preserving the intended metrics and licensing.
- **D.** Standardize on Android system fonts on purpose, retiring the dead declarations and assets where appropriate.
- **E.** Offer typography as an opt-in preference or theme capability, if that fits later customization work.

Validation for any change:

- Dark, Black, Light and LLAMA.
- Pixel/emulator, and Samsung/One UI where appropriate.
- Font scales 1.0 and 1.3.
- Light, normal, semibold and bold requests.
- Non-Latin fallback.
- Marquee initialization and cold start.
- The 22-role geometry comparison and representative Gate B–E surfaces.
- Accessibility and readability.
- Native widget non-regression (the widget uses native typography and should not change).

## Startup theme flash

A saved non-default theme (Black, Light, LLAMA) is restored asynchronously from Preferences, so the pre-render loading screen briefly shows the default Dark surface. This was measured at about 1.3 s on the emulator during the LLAMA Gate 1 review. It is pre-existing and not LLAMA-specific. A possible fix is a synchronous startup cache of the resolved theme applied before the app bundle runs. It would change startup and theme-restoration lifecycle behavior, so it needs its own phase.

## Live widget progress

The FULL widget's progress and time are a snapshot from the last widget update (Phase 2B). A live readout without periodic polling would need widget refresh calls on seek and speed changes inside playback code (a `Chronometer` alone drifts at non-1× speeds and after seeks). That touches playback code, so it needs its own authorization and battery review.

## Widget session mismatch after restart

After a process restart the widget shows `deviceData.lastPlaybackSession`, while widget Play resumes the session chosen by the restoration store. On the emulator these were different books. This is pre-existing (the baseline build shows the same session) and lives in playback/restoration, so it was not changed in Phase 2B.

## Widget responsive-layout text containment

Found in Phase 2C Gate F; it affects every widget theme. LLAMA was mitigated with spacing and text-size changes in its own layouts. The standard layouts are unchanged.

- **FULL NORMAL:** the readout panel takes the cover row's height. At narrow widths (≤~300dp) `FullArtwork` limits the cover by the width, so the readout gets ~86dp at every height, while a two-line title, author and time row need ~101dp. The time row (and the author) are squeezed.
- **COMPACT / WIDE:** two text lines share half of a short row and clip below ~72–92dp tall, depending on theme and layout.
- **Font scale:** larger scales widen both.

Measured boundaries are in `docs/widget-architecture.md` (Gate F section). `WidgetContainmentTest` asserts only the sizes that fit today.

A complete correction needs its own gate. Areas to investigate (no solution chosen):

- `FullArtwork` planning: reserve the readout's minimum height at narrow sizes instead of following the cover.
- A readout minimum-height reservation in the NORMAL layouts.
- The NORMAL/EXPANDED choice at narrow or short sizes.
- Accessibility font-scale behavior in every presentation.
- Whether the standard layouts get the same mitigation.
