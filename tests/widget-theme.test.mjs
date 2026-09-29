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
