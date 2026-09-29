# Home-screen widget: architecture audit (Phase 2B)

Read-only audit made before any LLAMA widget work. Nothing here is implemented. Widget changes wait for Gate 3 authorization.

## Current architecture

| Piece                                   | What it is                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MediaPlayerWidget.kt`                  | The single `AppWidgetProvider`. `onUpdate` only logs. `onEnabled` renders the last session and installs the widget updater. The top-level `updateAppWidget()` builds the `RemoteViews`.                                                     |
| `res/layout/media_player_widget.xml`    | One horizontal layout: cover (weight 2), author and title lines, a row of three buttons, and a small corner icon column.                                                                                                                    |
| `res/xml/media_player_widget_info.xml`  | `minWidth 275dp`, `minHeight 50dp`, **`resizeMode="horizontal"`**, `targetCellWidth 4` × `targetCellHeight 1`, `updatePeriodMillis` 1 day, home screen and keyguard, preview image `drawable-nodpi/media_player_widget_preview.png`.        |
| `res/xml/samsung_cover_widget_info.xml` | Samsung metadata: `display="sub_screen"`. This makes the same widget available on Galaxy Z Flip cover screens.                                                                                                                              |
| Manifest                                | `<receiver android:name="MediaPlayerWidget" android:exported="false">` with `APPWIDGET_UPDATE`, both metadata entries.                                                                                                                      |
| Styling                                 | `MediaPlayerWidgetTheme` (`#232323` background, `#373838` accent, white text), `widget_button_bg.xml` (a translucent white rounded button with a 1dp stroke), and `app_widget_background.xml` (system widget corner radius on Android 12+). |
| Update path                             | `DeviceManager.WidgetEventEmitter`: `onPlayerChanged(pns)` and `onPlayerClosed()`.                                                                                                                                                          |

The updater fires only on:

- play/pause changes (`PlayerListener.onIsPlayingChanged`);
- session preparation (`PlayerNotificationService.preparePlayer`);
- service destruction and player close.

There are **no periodic updates**, and there is no `onAppWidgetOptionsChanged`, so the widget never reacts to its own size.

## Capabilities and actions

- **Content:** cover (Glide `AppWidgetTarget`, 300×300, app-icon fallback), author, title, and a play/pause glyph that reflects `isPlaying`. The button row is hidden when nothing is live or resumable.
- **Actions** (`MediaButtonReceiver.buildMediaButtonPendingIntent`): **play/pause**, **rewind** (jump back) and **fast-forward** (jump forward). Tapping the widget body opens `MainActivity`. There is no previous/next chapter, bookmark, sleep timer or queue action, and the app doesn't expose these to the widget, so the mockup's extra buttons don't exist.
- **Process dead:** buttons go through `MediaButtonReceiver` to the player service. Play/pause (`KEYCODE_MEDIA_PLAY_PAUSE`) restores the last session through `restoreLastPlaybackSession()`; this is the path approved on the physical device. The launcher keeps showing the last `RemoteViews` it received.
- **Gap:** because `onUpdate` does nothing, a launcher that re-inflates the widget (after an app upgrade, launcher restart or reboot) may show the layout's placeholder `Artist`/`Title` text until the next playback event.

## Progress and timing data

The service exposes `getCurrentTime()`, `getDuration()` and `getBufferedTime()`, and the updater receives the service, so a snapshot of position and duration is available **at update time**. There is no continuous feed. The progress syncer ticks every 15 s while playing, and a widget update on each tick would be new behavior.

Options for the 4×2 "full" presentation:

- a `ProgressBar` snapshot at each existing update (accurate at play/pause, stale while playing);
- a `Chronometer` for elapsed or remaining time (base = now − position; ticks without updates, counts down on API 24+) plus a coarse bar;
- periodic updates tied to the 15 s syncer tick. This changes update frequency, so it would need its own approval and battery review.

## RemoteViews limits that matter for LLAMA

- Only framework views and XML drawables. There are no CSS shadows or gradients at runtime, and no custom views.
- **Bevels are still possible** with fixed XML drawables: `layer-list` with inset strokes (light top/left, dark bottom/right), `shape` gradients for steel, and a recessed black `shape` for readouts. They must be repository-owned resources.
- Colors come from resources, or from limited runtime setters: `setInt("setBackgroundColor")` loses the drawable; `setColorStateList` and similar need API 31+. minSdk is 24.
- Fonts: XML `fontFamily` (e.g. `monospace`) works. Runtime typefaces don't.
- Two-dimensional responsiveness: Android 12+ (API 31) supports responsive `RemoteViews` keyed by size (`Map<SizeF, RemoteViews>`). API 24–30 needs `onAppWidgetOptionsChanged` and a layout chosen from `OPTION_APPWIDGET_MIN/MAX_WIDTH/HEIGHT`.

## Theme sharing

- **Selected theme:** native code can read it the same way it already reads settings. `MediaManager.kt` reads the Capacitor Preferences store (`CapacitorStorage`), where the `$theme` service persists `theme` (`dark` | `black` | `light` | `llama`). This works when the app process is dead.
- **Palette:** don't hand-copy a second LLAMA palette. Generate a small native color resource set (base, raised, recessed, border, edge light/dark, text, muted, accent, played) from `theme/builtins.js` with a repository script, check it in, and add a parity test (like the existing `colors.xml` system-bar test).
  - Native code then maps a **fixed allow-list** of built-in ids to fixed resource sets. Any other or future theme value falls back to today's widget styling, so theme data never reaches native code as anything but a known id.
- **Prompt refresh:** today nothing re-renders the widget when the theme changes. It would change at the next play/pause. A prompt refresh needs a small bridge call from `$theme.select()` that re-runs the existing updater. That is new, narrowly scoped native surface.

## Placed-widget compatibility

- Keep the provider class name, receiver and `android.appwidget.provider` resource. Renaming or removing them removes users' placed widgets.
- Changing `resizeMode` (adding `vertical`), `minResize*`, `maxResize*` or the target cells on the **same** provider is compatible: existing instances stay and keep their size until the user resizes. New layouts apply at the next `updateAppWidget`.
- Adding extra providers adds picker entries and doesn't affect existing instances.
- The Samsung `sub_screen` metadata shares the same layout, so layout changes also reach Flip cover screens. The S22 Ultra has no cover screen, so that can't be verified on the test device.

## Recommendation

**A: one responsive widget** (compact ~3×1, wide 4×1, full 4×2) on the existing provider:

- enable vertical resizing;
- Android 12+: responsive `RemoteViews` by size;
- API 24–30: layout selection in `onAppWidgetOptionsChanged`;
- LLAMA resources chosen by the fixed theme allow-list, with today's styling kept for the other themes.

Reasons:

- The existing placed widget upgrades in place with no picker duplication.
- One code path serves all sizes.
- One UI supports two-dimensional resizing and the Android 12 responsive APIs.
- It matches how the current widget already behaves (one provider, resizable).

**B: separate providers per size** gives explicit picker entries with fixed initial sizes, which can help discoverability on Samsung's picker. The costs are three widgets to maintain, no morphing between sizes, and more metadata surface. Consider it later only if the S22 shows that users can't find the 4×2 size through resizing. It could be added as a thin second provider reusing the same rendering code.

## Emulator vs physical testing

| Emulator (AOSP API 35)                                               | Galaxy S22 Ultra (One UI) required                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Rendering of each size bucket, and responsive switching when resized | Samsung launcher picker, resize handles and grid sizes                         |
| Theme mapping (Dark/Black/Light keep current look; LLAMA resources)  | Real launcher corner radius, rendering and dark mode                           |
| Buttons fire the existing media-button intents                       | Widget Play and restore after process death on One UI power management         |
| Process-dead restore through play/pause on AOSP                      | Placed-widget upgrade from the current build (existing instance keeps working) |
| Refresh after theme change (if the bridge call is authorized)        | Lock-screen or keyguard behavior, battery impact of any periodic updates       |
|                                                                      | Galaxy Z Flip cover screen (not testable on an S22)                            |
