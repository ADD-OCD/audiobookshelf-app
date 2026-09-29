# Home-screen widget: architecture (Phase 2B)

One responsive widget on the existing provider (Gate 3, option A). Placed widgets upgrade in place. Dark, Black and Light keep the existing widget look; LLAMA has its own paint-only presentation.

## Pieces

| Piece                                                                    | What it is                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MediaPlayerWidget.kt`                                                   | The unchanged provider/receiver identity. `onUpdate`, `onAppWidgetOptionsChanged` and `onEnabled` call `WidgetRenderer.renderAll()`. `updateAppWidget()` (called by the widget updater) forwards to `WidgetRenderer.update()`. |
| `widget/WidgetRenderer.kt`                                               | Builds the `RemoteViews` for every size, sets the existing actions, loads artwork off the main thread and redraws once it's ready. Reads state only.                                                                           |
| `widget/WidgetSize.kt`                                                   | Size buckets: **COMPACT** (< 320dp wide, or short), **WIDE** (≥ 320dp wide, < 150dp high), **FULL** (≥ 250dp wide and ≥ 150dp high). Also the ideal sizes for Android 12+ responsive layouts.                                  |
| `widget/WidgetTheme.kt`                                                  | Fixed allow-list: the saved theme id `llama` → LLAMA; anything else, missing, malformed or of the wrong type → STANDARD.                                                                                                       |
| `widget/WidgetText.kt`                                                   | Snapshot formatting: elapsed, `-remaining` and a 0–1000 progress value, or nothing when unknown.                                                                                                                               |
| `res/layout/media_player_widget{,_wide,_full}.xml`                       | Standard layouts. COMPACT is the pre-existing layout (only view ids added).                                                                                                                                                    |
| `res/layout/media_player_widget{,_wide,_full}_llama.xml`                 | LLAMA variants with exactly the same view ids and actions; paint only.                                                                                                                                                         |
| `res/values/widget_theme_colors.xml`                                     | **Generated** by `scripts/generate-widget-theme.js` from `theme/builtins.js` (equipment-finish themes only). Do not edit by hand.                                                                                              |
| `res/drawable/widget_llama_*.xml`, `res/color/widget_llama_edge_light_*` | Original XML resources: chassis bevel, recessed readout, steel button (bevel inverts when pressed), artwork frame, amber progress. Bevel opacities match the app's bevels.                                                     |
| `res/xml/media_player_widget_info.xml`                                   | Only change: `resizeMode` gained `vertical` (now horizontal and vertical). Size, target cells, preview and the Samsung `sub_screen` metadata are unchanged.                                                                    |

## Rendering

- **Android 12+ (API 31+):** one responsive `RemoteViews(Map<SizeF, RemoteViews>)`. The launcher picks the layout for the current size, including while resizing.
- **API 24–30:** the layout is chosen from `OPTION_APPWIDGET_*` (portrait: min width × max height; landscape: max width × min height) and redrawn in `onAppWidgetOptionsChanged`. **Not exercised on a device yet** (only the classification is unit-tested).
- **When it draws:** the existing updater events (play/pause, session prepared, player closed or destroyed), plus launcher `onUpdate`, size changes and theme changes. With no state in the process (e.g. the launcher started it), it draws the last saved session as not playing.
- **onUpdate** now renders instead of only logging. This is needed so placed widgets pick up the responsive layouts after an upgrade, and it also fixes the old placeholder `Artist`/`Title` after a launcher re-inflate. It is render-only.
- The existing daily `updatePeriodMillis` is unchanged; nothing new is scheduled (no alarms, jobs, handlers or timers).

## Actions

Unchanged: play/pause, rewind (jump backward) and fast-forward (jump forward) through `MediaButtonReceiver.buildMediaButtonPendingIntent`, and tapping the widget opens `MainActivity` (`FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE`). Every size and theme uses the same four intents. The play/pause restoration path after process death is untouched.

## Progress and time (FULL only)

A **snapshot**: the progress bar, elapsed and remaining time are exactly what they were at the last widget update. They do not advance while playing.

A `Chronometer` was considered and rejected: it counts wall-clock time at 1×, so it drifts at other playback speeds and after seeks, and seeks and speed changes don't trigger a widget update. No periodic updates were added (per Gate 3). A live time would need widget refresh calls on seek and speed changes inside playback code, which needs separate authorization.

## Theme

- **Source of truth:** the saved built-in theme id (Capacitor Preferences key `theme`, SharedPreferences `CapacitorStorage`), read natively. It works when the app process is dead.
- **Allow-list only:** the id selects one of two repository-owned layout sets. No colors, styles, paths, drawable names or resource ids cross from preference data into native code.
- **Refresh bridge:** `AbsDatabase.refreshWidgets()` takes no arguments and only redraws. `ThemeService.select()` calls it after persisting, native only, errors logged and ignored. Startup restore doesn't call it.
- **Parity:** `tests/widget-theme.test.mjs` fails if the generated XML is stale, if its colors differ from the tokens, if the Kotlin allow-list names an id that isn't a built-in with a generated palette, or if a LLAMA layout's view ids differ from its standard layout.

## Placed-widget compatibility

- The provider class, receiver and `android.appwidget.provider` resource are unchanged, so existing instances survive the upgrade (verified on the emulator: same widget id, redrawn without opening the app).
- Only `resizeMode` gained `vertical`. Existing instances keep their size until resized.
- The Samsung `sub_screen` (Z Flip cover screen) metadata is preserved but **untested**: there is no cover-screen device available.

## RemoteViews notes

- LLAMA layouts use `android:tint` (platform `ImageView`); `app:tint` needs AppCompat and does nothing in `RemoteViews`, so lint's `UseAppTint` is suppressed there.
- Artwork in LLAMA uses `cropToPadding` so the cover never paints over its frame, and an 8dp content inset clears the launcher's corner radius.
- `progressDrawable` can't be set at runtime before API 31, which is one reason LLAMA uses separate layouts instead of runtime restyling.

## Emulator validation (AOSP API 35, Pixel launcher)

| Check                                                                   | Result                                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Place widget with the baseline build (c7a617bc), upgrade to this branch | Same widget id and provider; redrawn after install without opening the app                         |
| COMPACT / WIDE / FULL                                                   | All three render; resize switches layouts; resize redraws from the last state                      |
| Dark / Black / Light / LLAMA                                            | Standard look identical for all three; LLAMA applied immediately on selection in Settings (bridge) |
| Invalid saved value (`@drawable/widget_llama_chassis`) + refresh        | Standard look                                                                                      |
| Artwork present / absent, long title and author                         | Cover or app icon; text ellipsizes in all sizes                                                    |
| Play/pause, jump forward, jump backward, tap to open                    | All work through the existing paths                                                                |
| Process killed, then widget Play                                        | Resumes at the saved position                                                                      |
| Snapshot while playing                                                  | Unchanged after 40 s of playback; the package has no alarms or scheduled jobs                      |

Observed, not changed (pre-existing, outside the widget): after a restart the widget shows `deviceData.lastPlaybackSession`, while widget Play resumes the session chosen by the restoration store; on the test device these were different books. The baseline build shows the same session.

## Galaxy S22 Ultra checklist (One UI; not yet verified)

1. Install the current `plus` build and place the widget at its default size. Install this branch's build over it: the widget must stay, keep its size and show the last book without opening the app.
2. Resize through the One UI grid: 3×1 or narrowest allowed (COMPACT), 4×1 (WIDE), 4×2 (FULL). Check text isn't clipped at each size.
3. Settings → Theme: Dark, Black, Light (widget unchanged), then LLAMA (widget switches promptly). Check the One UI corner radius against the LLAMA chassis and artwork frame, in light and dark system mode.
4. Actions in every size: play/pause, jump backward, jump forward, tap to open.
5. Pause, swipe the app away, wait, then press Play on the widget: playback resumes at the saved position.
6. Reboot: the widget shows the last book (not placeholder text) in the saved theme.
7. FULL while playing: time and bar stay at the snapshot (expected), and update on pause/play.
8. Lock-screen / keyguard behavior, if One UI offers the widget there.
9. Battery: no new wakeups attributable to the widget over a listening session.
10. Z Flip cover screen: not testable on an S22.
