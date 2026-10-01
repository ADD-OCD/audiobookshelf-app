import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const engine = require('../theme/engine.js')
const presets = require('../theme/presets.js')
const { TOKEN_NAMES } = require('../theme/tokens.js')
const { BUILTIN_THEMES } = require('../theme/builtins.js')
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const llama = () => engine.getTheme('llama')

// WCAG relative luminance / contrast ratio
const luminance = ([r, g, b]) => {
  const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('LLAMA is a registered built-in that defines every token explicitly (no silent fallbacks)', () => {
  const definition = BUILTIN_THEMES.find((t) => t.id === 'llama')
  for (const name of TOKEN_NAMES) assert.ok(Object.prototype.hasOwnProperty.call(definition.tokens, name), name)
  assert.deepEqual(engine.validateTheme(definition, null).errors, [])
  assert.deepEqual(engine.BUILTIN_ERRORS, [])
  assert.equal(llama().id, 'llama')
  assert.equal(llama().colorScheme, 'dark')
  assert.equal(engine.resolveThemeId('llama'), 'llama')
  for (const value of ['LLAMA', 'Llama', 'llama ', 'llama;']) assert.equal(engine.resolveThemeId(value), 'dark', value)
})

test('LLAMA uses the equipment finish and theme cover color', () => {
  assert.equal(llama().tokens['presentation.finish'], 'equipment')
  assert.equal(llama().tokens['presentation.cover-color'], 'theme')
})

test('LLAMA label uses the localization architecture (English fallback key exists)', async () => {
  const strings = JSON.parse(await read('../strings/en-us.json'))
  assert.equal(strings[llama().labelKey], 'LLAMA')
})

test('LLAMA palette keeps its intended depth order: recessed < base < content < raised < hover', () => {
  const t = llama().tokens
  const order = ['surface.recessed', 'surface.base', 'surface.content', 'surface.raised', 'surface.hover'].map((n) => luminance(t[n]))
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `step ${i}`)
  // Blue-gray, not neutral charcoal: blue channel leads on every chassis surface
  for (const n of ['surface.base', 'surface.content', 'surface.raised', 'surface.hover']) assert.ok(t[n][2] > t[n][0] + 10, n)
})

test('LLAMA text, readout and progress colors meet contrast targets on the surfaces they sit on', () => {
  const t = llama().tokens
  for (const surface of ['surface.base', 'surface.content', 'surface.recessed']) {
    assert.ok(contrast(t['text.primary'], t[surface]) >= 4.5, `text.primary on ${surface}`)
    assert.ok(contrast(t['text.muted'], t[surface]) >= 4.5, `text.muted on ${surface}`)
    assert.ok(contrast(t['accent.primary'], t[surface]) >= 4.5, `accent.primary on ${surface}`)
  }
  assert.ok(contrast(t['text.primary'], t['surface.raised']) >= 4.5, 'text.primary on surface.raised')
  assert.ok(contrast(t['text.muted'], t['surface.raised']) >= 3, 'text.muted (icons) on surface.raised')
  // Played progress vs its recessed track, and the buffered portion vs the track
  assert.ok(contrast(t['progress.played'], t['progress.track']) >= 3, 'played vs track')
  assert.ok(contrast(t['progress.buffered'], t['progress.track']) >= 1.5, 'buffered visibly distinct from track')
})

test('LLAMA keeps semantic states, and amber progress stays distinguishable from warning', () => {
  const t = llama().tokens
  const dark = engine.getTheme('dark').tokens
  for (const n of ['state.success', 'state.success-strong', 'state.warning', 'state.error', 'state.info']) assert.deepEqual(t[n], dark[n], n)
  const [pr, pg, pb] = t['progress.played']
  const [wr, wg, wb] = t['state.warning']
  assert.ok(Math.abs(pg - wg) >= 40, 'amber progress vs orange warning: green channel apart')
  assert.notDeepEqual([pr, pg, pb], [wr, wg, wb])
  assert.ok(t['accent.primary'][1] > 200 && t['accent.primary'][0] < 128 && t['accent.primary'][2] < 128, 'phosphor green accent')
})

test('the real Tailwind build emits LLAMA variables and its equipment root while Dark stays :root', async () => {
  const postcss = require('postcss')
  const tailwind = require('tailwindcss')
  const config = require('../tailwind.config.js')
  const source = await read('../assets/tailwind.css')
  const { css } = await postcss([tailwind({ ...config, content: [{ raw: '<div class="text-success"></div>' }] })]).process(source, { from: undefined })
  const selector = engine.themeSelector('llama')
  assert.equal(selector, "html[data-theme='llama']")
  const blocks = [...css.matchAll(/html\[data-theme='llama'\] \{([^}]*)\}/g)].map((m) => m[1]).join('\n')
  for (const [property, value] of Object.entries(engine.themeDeclarations(llama().tokens))) assert.ok(blocks.includes(`${property}: ${value};`), property)
  for (const [property, value] of Object.entries(presets.equipmentDerivedDeclarations(llama().tokens))) assert.ok(blocks.includes(`${property}: ${value};`), property)
  assert.equal(engine.themeSelector('dark'), ':root')
})

// ThemeService with mocked boundaries (same approach as tests/theme.test.mjs)
async function loadThemePlugin(stored) {
  const source = (await read('../plugins/theme.client.js'))
    .replace(/^import .*$/gm, '')
    .replace('export class ThemeService', 'class ThemeService')
    .replace('export default', 'globalThis.plugin =')
  const store = { value: stored, writes: [] }
  const calls = []
  const root = { dataset: {} }
  const sandbox = {
    Vue: { observable: (o) => o },
    Capacitor: { getPlatform: () => 'android' },
    StatusBar: { setStyle: async (o) => calls.push(o.style) },
    Style: { Dark: 'DARK', Light: 'LIGHT' },
    themeEngine: engine,
    AbsDatabase: { refreshWidgets: async () => {} },
    document: { documentElement: root },
    console: { ...console, error: () => {} }
  }
  vm.runInNewContext(source, sandbox)
  let service
  sandbox.plugin(
    {
      app: {
        $localStore: {
          getTheme: async () => store.value,
          setTheme: async (v) => {
            store.value = v
            store.writes.push(v)
          }
        }
      }
    },
    (name, value) => (service = value)
  )
  await service.ready
  return { service, root, store, calls }
}

test('a persisted LLAMA selection restores after restart', async () => {
  const { service, root, calls } = await loadThemePlugin('llama')
  assert.equal(service.id, 'llama')
  assert.equal(root.dataset.theme, 'llama')
  assert.deepEqual(calls, ['DARK', 'DARK'])
})

test('switching LLAMA to Dark, Black and Light and back persists each selection', async () => {
  const { service, root, store } = await loadThemePlugin('dark')
  for (const id of ['llama', 'dark', 'llama', 'black', 'llama', 'light', 'llama']) {
    assert.equal(await service.select(id), id)
    assert.equal(root.dataset.theme, id)
    assert.equal(store.value, id)
  }
  assert.deepEqual(store.writes, ['llama', 'dark', 'llama', 'black', 'llama', 'light', 'llama'])
})

test('non-EPUB reader shell: Dark/Black/Light keep their shell, LLAMA uses the dark-compatible shell', async () => {
  for (const id of ['dark', 'black', 'light']) assert.equal(engine.readerShellId(engine.getTheme(id)), id)
  assert.equal(engine.readerShellId(llama()), 'dark')
  assert.equal(engine.readerShellId(null), 'dark')
  const light = engine.getTheme('light')
  const { theme } = engine.validateTheme({ ...light, id: 'paper' }, light.tokens)
  assert.equal(engine.readerShellId(theme), 'light')
  const reader = await read('../components/readers/Reader.vue')
  assert.match(reader, /if \(this\.isEpub\) return this\.ereaderSettings\.theme/) // EPUB preference untouched
  assert.match(reader, /data-\[theme=dark\]:bg-\[#232323\]/) // the existing dark shell it maps onto
})

test('LLAMA progress repaint targets only unfinished playback bars and the current-chapter marker, never warning semantics or finished state', () => {
  const selectors = Object.keys(presets.presentationRules([llama()]))
  const progress = selectors.filter((s) => s.includes('bg-yellow-400'))
  assert.deepEqual(progress, ["html[data-theme='llama'] .modal .chapters-panel li > .bg-yellow-400", "html[data-theme='llama'] .absolute.bottom-0.left-0.z-10.bg-yellow-400"])
  for (const s of selectors) {
    assert.doesNotMatch(s, /warning|bg-success|text-success|bg-error/, s)
    if (s.includes('bg-yellow-400')) assert.ok(s.includes('.absolute.bottom-0.left-0.z-10') || s.includes('.chapters-panel li > '), s) // never bare yellow
  }
  const rules = presets.presentationRules([llama()])
  for (const s of progress) assert.deepEqual(rules[s], { 'background-color': 'rgb(var(--color-track-cursor))' }, s)
})

test('Chapters: LLAMA-only paint (recessed list, chassis header, lit current row, played-amber marker)', async () => {
  const rules = presets.presentationRules([llama()])
  const chapters = Object.entries(rules).filter(([s]) => s.includes('.chapters-panel'))
  assert.ok(chapters.length >= 4)
  for (const [selector, declarations] of chapters) {
    assert.ok(selector.startsWith("html[data-theme='llama'] .modal .chapters-panel"), selector)
    for (const property of Object.keys(declarations)) assert.match(property, /^(background-color|background-image|box-shadow|color)$/, `${selector}: ${property} (paint only)`)
  }
  const t = llama().tokens
  assert.equal(rules["html[data-theme='llama'] .modal .chapters-panel.bg-secondary"]['background-color'], 'rgb(var(--color-recessed))')
  // Current row is clearly lit against the well; text stays readable on both
  assert.equal(rules["html[data-theme='llama'] .modal .chapters-panel li.bg-primary"]['background-color'], 'rgb(var(--color-bg))')
  assert.ok(luminance(t['surface.content']) > luminance(t['surface.recessed']) * 2)
  for (const surface of ['surface.recessed', 'surface.content']) assert.ok(contrast(t['text.muted'], t[surface]) >= 4.5, `muted times on ${surface}`)
  // Header labels on the raised strip get the same contrast margin as other small muted headers
  const blend = t['text.primary'].map((c, i) => Math.round(c * 0.85 + t['surface.raised'][i] * 0.15))
  assert.ok(contrast(blend, t['surface.raised']) >= 4.5, 'header labels')
  // The current-chapter marker is repainted with the played-progress token (color only: same element, size, position)
  assert.deepEqual(rules["html[data-theme='llama'] .modal .chapters-panel li > .bg-yellow-400"], { 'background-color': 'rgb(var(--color-track-cursor))' })
  assert.deepEqual(t['progress.played'], [245, 190, 40])
  // Standard themes: no rules at all, and the hook class is the only template change
  for (const id of ['dark', 'black', 'light']) assert.deepEqual(presets.presentationRules([engine.getTheme(id)]), {}, id)
  const modal = await read('../components/modals/ChaptersModal.vue')
  assert.match(modal, /class="chapters-panel w-full overflow-x-hidden overflow-y-auto bg-secondary rounded-lg border border-fg\/20"/)
  assert.match(modal, /class="w-0\.5 h-full absolute top-0 left-0 bg-yellow-400"/)
})

test('LLAMA toggle styling keeps the on-state color and only recolors the off slot and thumb', () => {
  const rules = presets.presentationRules([llama()])
  const toggle = Object.entries(rules).filter(([s]) => s.includes('border-gray-400'))
  assert.ok(toggle.length >= 3)
  for (const [selector, declarations] of toggle) {
    assert.doesNotMatch(selector, /bg-success/, selector)
    for (const property of Object.keys(declarations)) assert.doesNotMatch(property, /width|height|transform|padding|margin|left|top/, property)
  }
})

// --- Phase 2C Gate A: shared equipment primitives and presentation defect fixes ---

const SAFE_VALUE = /^[a-z0-9 .,%()/#-]+$/i

test('shared equipment primitives exist as fixed, frozen, paint-only recipe values', () => {
  const P = presets.PRIMITIVES
  assert.ok(Object.isFrozen(P))
  for (const name of ['RADIUS', 'ELEVATION', 'RAISED_BEVEL', 'PRESSED_BEVEL', 'RECESSED_WELL', 'STEEL_SHEEN', 'CHASSIS_SHEEN', 'ARTWORK_FRAME', 'ENGRAVED_SEPARATOR', 'KEY_CAP', 'KEY_CAP_PRESSED', 'SELECTED_KEY']) assert.ok(P[name], name)
  // Radius scale: squared frames, squared keys/wells/panels, full rounding only for circular controls
  assert.deepEqual({ ...P.RADIUS }, { frame: '2px', key: '4px', round: '9999px' })
  assert.ok(Object.isFrozen(P.RADIUS) && Object.isFrozen(P.ELEVATION))
  // Three elevation levels, increasing blur, each a plain black drop shadow
  assert.deepEqual(Object.keys(P.ELEVATION), ['raised', 'panel', 'overlay'])
  const levels = Object.values(P.ELEVATION)
  const blur = (v) => Number(v.split(' ')[2].replace('px', ''))
  for (let i = 1; i < levels.length; i++) assert.ok(blur(levels[i]) > blur(levels[i - 1]), levels[i])
  for (const v of levels) assert.match(v, /^\d+(px)? \d+px \d+px rgb\(0 0 0 \/ 0\.\d+\)$/, v)
  // Engraved separator: two inset lines only (never changes size): light return over a dark seam
  const parts = P.ENGRAVED_SEPARATOR.split(', ')
  assert.equal(parts.length, 2)
  for (const part of parts) assert.match(part, /^inset 0 -\d+px 0 rgb\(var\(--color-edge-(light|dark)\)/, part)
  assert.match(parts[0], /--color-edge-light\) \/ 0\.\d+/)
  assert.match(parts[1], /--color-edge-dark/)
  // Control states are declaration sets of paint properties only
  for (const set of [P.KEY_CAP, P.KEY_CAP_PRESSED, P.SELECTED_KEY]) {
    assert.ok(Object.isFrozen(set))
    for (const [property, value] of Object.entries(set)) {
      assert.match(property, /^(background-color|background-image|box-shadow|border-radius|color)$/, property)
      assert.match(value, SAFE_VALUE, value)
    }
  }
  // Selected key: pressed (inset) + an accent cue, so state never relies on color alone
  assert.match(P.SELECTED_KEY['box-shadow'], /^inset 0 0 0 1px rgb\(var\(--color-accent\)/)
  assert.ok(P.SELECTED_KEY['box-shadow'].includes(P.PRESSED_BEVEL))
  assert.equal(P.SELECTED_KEY['background-image'], 'none')
  // Key cap: raised bevel on the control's own box (squared), pressed inverts it; no fill or size change
  assert.deepEqual({ ...P.KEY_CAP }, { 'border-radius': P.RADIUS.key, 'background-image': P.STEEL_SHEEN, 'box-shadow': P.RAISED_BEVEL })
  assert.deepEqual({ ...P.KEY_CAP_PRESSED }, { 'background-image': 'none', 'box-shadow': P.PRESSED_BEVEL })
  // Every string primitive is a safe paint value that references only derived edge colors or the accent token
  for (const value of [P.RAISED_BEVEL, P.PRESSED_BEVEL, P.RECESSED_WELL, P.STEEL_SHEEN, P.CHASSIS_SHEEN, P.ARTWORK_FRAME, P.ENGRAVED_SEPARATOR, P.SELECTED_KEY['box-shadow'], ...Object.values(P.RADIUS), ...Object.values(P.ELEVATION)]) {
    assert.match(value, SAFE_VALUE, value)
    for (const v of value.match(/--[a-z-]+/g) || []) assert.ok(['--color-edge-light', '--color-edge-dark', '--color-accent'].includes(v), v)
  }
})

test('existing rules reuse the primitives (radius scale, elevation levels, pressed state)', () => {
  const P = presets.PRIMITIVES
  const rules = presets.presentationRules([llama()])
  const root = engine.themeSelector('llama')
  assert.equal(rules[`${root} .fullscreen #playerTrack`]['border-radius'], P.RADIUS.key)
  assert.equal(rules[`${root} .fullscreen .total-track`]['border-radius'], P.RADIUS.key)
  assert.ok(rules[`${root} .btn:not(:disabled)`]['box-shadow'].endsWith(P.ELEVATION.raised))
  assert.ok(rules[`${root} .card-artwork`]['box-shadow'].endsWith(P.ELEVATION.panel))
  for (const s of ['.modal .rounded-lg.bg-primary', '.modal .queue-panel.rounded-lg.bg-primary', '.modal .chapters-panel.bg-secondary']) assert.ok(rules[`${root} ${s}`]['box-shadow'].endsWith(P.ELEVATION.overlay), s)
  assert.deepEqual(rules[`${root} .btn:not(:disabled):active`], { ...P.KEY_CAP_PRESSED })
  assert.deepEqual(rules[`${root} .icon-btn.border:not(:disabled):active`], { ...P.KEY_CAP_PRESSED })
  // No radius in the recipe falls outside the scale
  for (const [selector, declarations] of Object.entries(rules)) if (declarations['border-radius']) assert.ok(Object.values(P.RADIUS).includes(declarations['border-radius']), selector)
})

test('artwork frame targets artwork via the card-artwork hook, never a whole list row', async () => {
  const rules = presets.presentationRules([llama()])
  assert.ok(!Object.keys(rules).some((s) => s.includes('book-card')), 'no id-prefix selector (it also matches list rows)')
  const frame = rules["html[data-theme='llama'] .card-artwork"]
  assert.deepEqual(Object.keys(frame), ['box-shadow'])
  assert.ok(frame['box-shadow'].startsWith(presets.PRIMITIVES.ARTWORK_FRAME))
  // Grid card: the card root is the cover, so it carries the hook (next to the id other code relies on)
  const grid = await read('../components/cards/LazyBookCard.vue')
  assert.match(grid, /<div ref="card" tabindex="0" :id="`book-card-\$\{index\}`"[^>]*class="card-artwork rounded-sm z-10 bg-primary cursor-pointer box-shadow-book"/)
  assert.equal((grid.match(/card-artwork/g) || []).length, 1)
  // List row: the row root (same id prefix) has no hook; only its cover box does
  const list = await read('../components/cards/LazyListBookCard.vue')
  const rowRoot = list.match(/<div ref="card" :id="`book-card-\$\{index\}`"[^>]*>/)[0]
  assert.doesNotMatch(rowRoot, /card-artwork/)
  assert.match(list, /<div class="card-artwork list-card-cover relative">/)
  assert.equal((list.match(/card-artwork/g) || []).length, 1)
})

test('only bordered icon buttons get the steel key treatment; borderless icon buttons stay bare glyphs', async () => {
  const rules = presets.presentationRules([llama()])
  const iconSelectors = Object.keys(rules).filter((s) => s.includes('icon-btn'))
  assert.deepEqual(iconSelectors, ["html[data-theme='llama'] .icon-btn.border:not(:disabled)", "html[data-theme='llama'] .icon-btn.border:not(:disabled):active"])
  // The components add `border` exactly when the button is not borderless
  const iconBtn = await read('../components/ui/IconBtn.vue')
  assert.match(iconBtn, /if \(!this\.borderless\) \{\s*classes\.push\(`bg-\$\{this\.bgColor\} border border-gray-600`\)/)
  const readBtn = await read('../components/ui/ReadIconBtn.vue')
  assert.match(readBtn, /:class="borderless \? '' : 'bg-primary border border-gray-600'"/)
})

test('Gate A rules compile through Tailwind with their exact values; standard themes get none of them', async () => {
  const postcss = require('postcss')
  const tailwind = require('tailwindcss')
  const config = require('../tailwind.config.js')
  const source = await read('../assets/tailwind.css')
  const content = config.content.map((glob) => new URL(`../${glob}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  const { css } = await postcss([tailwind({ ...config, content })]).process(source, { from: undefined })
  const block = (selector) => {
    const i = css.indexOf(`${selector} {`)
    assert.ok(i >= 0, selector)
    return css.slice(i, css.indexOf('}', i))
  }
  assert.match(block("html[data-theme='llama'] .modal .chapters-panel li > .bg-yellow-400"), /background-color: rgb\(var\(--color-track-cursor\)\)/)
  assert.match(block("html[data-theme='llama'] .card-artwork"), /box-shadow: 0 0 0 1px rgb\(var\(--color-edge-dark\)\)/)
  assert.match(block("html[data-theme='llama'] .icon-btn.border:not(:disabled)"), /background-image: linear-gradient/)
  assert.ok(!/(^|\n)\s*\.card-artwork\s*\{/.test(css), 'no unscoped card-artwork rule')
  assert.ok(!css.includes('[id^=book-card]'), 'the old row-matching selector is gone')
  for (const id of ['dark', 'black', 'light']) assert.deepEqual(presets.presentationRules([engine.getTheme(id)]), {}, id)
})
