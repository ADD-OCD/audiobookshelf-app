import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const engine = require('../theme/engine.js')
const presets = require('../theme/presets.js')
const generator = require('../scripts/generate-widget-theme.js')
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('the committed native widget palette matches the canonical built-in theme data', async () => {
  const committed = (await read('../android/app/src/main/res/values/widget_theme_colors.xml')).replace(/\r\n/g, '\n')
  assert.equal(committed, generator.render(), 'stale: run node scripts/generate-widget-theme.js')
})

test('native widget colors equal the LLAMA tokens and derived bevel edges', async () => {
  const xml = await read('../android/app/src/main/res/values/widget_theme_colors.xml')
  const colors = Object.fromEntries([...xml.matchAll(/<color name="([a-z_]+)">#([0-9A-F]{6})<\/color>/g)].map(([, n, h]) => [n, [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))]))
  const t = engine.getTheme('llama').tokens
  assert.deepEqual(colors.widget_llama_base, t['surface.base'])
  assert.deepEqual(colors.widget_llama_recessed, t['surface.recessed'])
  assert.deepEqual(colors.widget_llama_accent, t['accent.primary'])
  assert.deepEqual(colors.widget_llama_played, t['progress.played'])
  assert.deepEqual(colors.widget_llama_text, t['text.primary'])
  const derived = presets.equipmentDerivedDeclarations(t)
  assert.deepEqual(colors.widget_llama_edge_light, derived['--color-edge-light'].split(' ').map(Number))
  assert.deepEqual(colors.widget_llama_edge_dark, derived['--color-edge-dark'].split(' ').map(Number))
  assert.equal(Object.keys(colors).length, generator.TOKEN_COLORS.length + 2)
})

test('only equipment-finish built-ins get a native widget palette; standard themes keep the existing look', () => {
  assert.deepEqual(
    generator.widgetThemes().map((t) => t.id),
    ['llama']
  )
})

const LAYOUTS = '../android/app/src/main/res/layout/'
const VARIANTS = [
  ['media_player_widget.xml', 'media_player_widget_llama.xml'],
  ['media_player_widget_wide.xml', 'media_player_widget_wide_llama.xml'],
  ['media_player_widget_full.xml', 'media_player_widget_full_llama.xml']
]
const viewIds = (xml) => [...xml.matchAll(/android:id="@\+id\/([A-Za-z]+)"/g)].map((m) => m[1]).sort()

test('each LLAMA layout has exactly the view ids (and so the actions) of its standard layout', async () => {
  for (const [standard, llama] of VARIANTS) {
    const ids = viewIds(await read(LAYOUTS + standard))
    assert.ok(ids.includes('widgetPlayPauseButton') && ids.includes('widgetBackground'))
    assert.deepEqual(viewIds(await read(LAYOUTS + llama)), ids, llama)
  }
})

test('LLAMA layouts paint only with generated/LLAMA resources; standard layouts never use them', async () => {
  for (const [standard, llama] of VARIANTS) {
    const llamaXml = await read(LAYOUTS + llama)
    for (const [, ref] of llamaXml.matchAll(/"@(?:color|drawable)\/([a-z_0-9]+)"/g)) {
      assert.ok(/^widget_llama_/.test(ref) || ['icon', 'icon_monochrome', 'exo_icon_rewind', 'exo_icon_fastforward', 'ic_media_play_dark'].includes(ref), `${llama}: ${ref}`)
    }
    assert.doesNotMatch(llamaXml, /colorAccent|#[0-9A-Fa-f]{6}/, `${llama} has no hard-coded or standard colors`)
    assert.doesNotMatch(await read(LAYOUTS + standard), /llama/, `${standard} is unchanged by LLAMA`)
  }
})

const attrs = (xml, id) => {
  const start = xml.indexOf(`android:id="@+id/${id}"`)
  return xml.slice(xml.lastIndexOf('<', start), xml.indexOf('>', start))
}

test('FULL artwork is bounded (cap, both dimensions wrap, aspect kept, no crop) in standard and LLAMA', async () => {
  const dimens = await read('../android/app/src/main/res/values/dimens.xml')
  const cap = Number(dimens.match(/<dimen name="widget_full_artwork_max">(\d+)dp<\/dimen>/)[1])
  // Below the fixed-density cover's ~300dp intrinsic size (WidgetArtworkTest), so the cap is what bounds it
  assert.ok(cap < 300, `cap ${cap}dp`)
  // Normal two-row FULL artwork (~137dp on the emulator) stays uncapped, so that size renders as before
  assert.ok(cap >= 137, `cap ${cap}dp`)
  // Narrowest FULL (minWidth 275dp) minus content padding (16), readout margin (10), corner icon (22): the readout
  // keeps a usable width however tall the widget gets (unbounded artwork used to squeeze it to nothing)
  assert.ok(275 - 16 - 10 - 22 - cap >= 80, `readout width at 275dp with a ${cap}dp cap`)
  for (const file of ['media_player_widget_full.xml', 'media_player_widget_full_llama.xml']) {
    const art = attrs(await read(LAYOUTS + file), 'widgetAlbumArt')
    for (const expected of ['android:layout_width="wrap_content"', 'android:layout_height="wrap_content"', 'android:adjustViewBounds="true"', 'android:maxWidth="@dimen/widget_full_artwork_max"', 'android:maxHeight="@dimen/widget_full_artwork_max"', 'android:scaleType="fitCenter"']) {
      assert.ok(art.includes(expected), `${file}: ${expected}`)
    }
  }
  const renderer = await read('../android/app/src/main/java/app/absplus/android/widget/WidgetRenderer.kt')
  assert.match(renderer, /widgetArtwork\(it\)/, 'loaded covers get the fixed-density widget copy')
})

test('provider identity is unchanged: one MediaPlayerWidget receiver with the same metadata', async () => {
  const manifest = await read('../android/app/src/main/AndroidManifest.xml')
  assert.equal([...manifest.matchAll(/android:name="android\.appwidget\.provider"/g)].length, 1)
  assert.match(manifest, /<receiver\s+android:name="MediaPlayerWidget"\s+android:exported="false">/)
  assert.match(manifest, /android:name="android\.appwidget\.provider"\s+android:resource="@xml\/media_player_widget_info"/)
  assert.match(manifest, /android:name="com\.samsung\.android\.appwidget\.provider"\s+android:resource="@xml\/samsung_cover_widget_info"/)
  const info = await read('../android/app/src/main/res/xml/media_player_widget_info.xml')
  assert.match(info, /android:minWidth="275dp"/)
  assert.match(info, /android:updatePeriodMillis="86400000"/) // the existing daily update, unchanged
})

test('widget actions are exactly play/pause, jump back, jump forward and open, on every layout', async () => {
  const renderer = await read('../android/app/src/main/java/app/absplus/android/widget/WidgetRenderer.kt')
  const clicks = [...renderer.matchAll(/setOnClickPendingIntent\(R\.id\.(\w+), actions\.(\w+)\)/g)].map((m) => `${m[1]}=${m[2]}`)
  assert.deepEqual(clicks.sort(), ['widgetBackground=open', 'widgetFastForwardButton=fastForward', 'widgetPlayPauseButton=playPause', 'widgetRewindButton=rewind'])
  for (const action of ['ACTION_PLAY_PAUSE', 'ACTION_FAST_FORWARD', 'ACTION_REWIND']) assert.match(renderer, new RegExp(`buildMediaButtonPendingIntent\\(context, PlaybackStateCompat\\.${action}\\)`))
  assert.match(renderer, /FLAG_UPDATE_CURRENT or PendingIntent\.FLAG_IMMUTABLE/)
})

test('widget code schedules nothing (no alarms, jobs, timers, delayed posts or Chronometer)', async () => {
  const dir = '../android/app/src/main/java/app/absplus/android/'
  const files = ['MediaPlayerWidget.kt', 'widget/WidgetRenderer.kt', 'widget/WidgetSize.kt', 'widget/WidgetTheme.kt', 'widget/WidgetText.kt']
  for (const file of files) {
    assert.doesNotMatch(await read(dir + file), /AlarmManager|WorkManager|JobScheduler|postDelayed|scheduleAtFixedRate|Timer\(|Chronometer|setChronometer/, file)
  }
  for (const [standard, llama] of VARIANTS) for (const file of [standard, llama]) assert.doesNotMatch(await read(LAYOUTS + file), /Chronometer/, file)
})

test('the native allow-list names only real built-in theme ids that have a generated palette', async () => {
  const kotlin = await read('../android/app/src/main/java/app/absplus/android/widget/WidgetTheme.kt')
  const allowList = kotlin.slice(kotlin.indexOf('fun fromThemeId'), kotlin.indexOf('fun current'))
  const ids = [...allowList.matchAll(/"([a-z0-9-]+)" ->/g)].map((m) => m[1])
  assert.deepEqual(ids, ['llama'])
  const palettes = generator.widgetThemes().map((t) => t.id)
  for (const id of ids) {
    assert.equal(engine.resolveThemeId(id), id, `${id} is a built-in`)
    assert.ok(palettes.includes(id), `${id} has a generated palette`)
  }
  assert.match(allowList, /else -> STANDARD/)
})
