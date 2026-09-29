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
