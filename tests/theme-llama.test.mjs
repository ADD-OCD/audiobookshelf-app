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
  for (const name of ['RADIUS', 'ELEVATION', 'RAISED_BEVEL', 'PRESSED_BEVEL', 'RECESSED_WELL', 'STEEL_SHEEN', 'PRIMARY_STEEL', 'PRIMARY_STEEL_PRESSED', 'CHASSIS_SHEEN', 'ARTWORK_FRAME', 'ENGRAVED_SEPARATOR', 'ENGRAVED_SEPARATOR_TOP', 'RECESSED_FACE', 'KEY_CAP', 'KEY_CAP_PRESSED', 'SELECTED_KEY']) assert.ok(P[name], name)
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
  for (const value of [P.RAISED_BEVEL, P.PRESSED_BEVEL, P.RECESSED_WELL, P.STEEL_SHEEN, P.PRIMARY_STEEL, P.PRIMARY_STEEL_PRESSED, P.CHASSIS_SHEEN, P.ARTWORK_FRAME, P.ENGRAVED_SEPARATOR, P.ENGRAVED_SEPARATOR_TOP, P.RECESSED_FACE, P.SELECTED_KEY['box-shadow'], ...Object.values(P.RADIUS), ...Object.values(P.ELEVATION)]) {
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

// --- Phase 2C Gate B: full player and mini-player equipment fidelity (paint only) ---

const GATE_B = ['.fullscreen .cover-wrapper', '.fullscreen #playerContent', '.fullscreen #playerControls', '#streamContainer:not(.fullscreen) #playerTrack', '#playerContent .player-key:not(.key-disabled)', '#playerContent .player-key:not(.key-disabled):active', '#playerContent .sleep-readout', '#playerTrack .bg-track-cursor.bg-yellow-300']

test('Gate B player rules are paint only, built from the shared primitives', () => {
  const P = presets.PRIMITIVES
  const root = engine.themeSelector('llama')
  const rules = presets.presentationRules([llama()])
  const rule = (s) => rules[`${root} ${s}`]
  for (const s of GATE_B) {
    assert.ok(rule(s), s)
    for (const [property, value] of Object.entries(rule(s))) {
      assert.match(property, /^(background-color|background-image|box-shadow|border-radius|color)$/, `${s}: ${property}`)
      assert.match(value, SAFE_VALUE, `${s}: ${value}`)
    }
  }
  // Artwork: squared frame radius (replaces the player's 16px fullscreen card radius), mounted with the panel elevation
  assert.equal(rule('.cover-wrapper')['border-radius'], P.RADIUS.frame)
  assert.equal(rule('.fullscreen .cover-wrapper')['box-shadow'], `${P.ARTWORK_FRAME}, ${P.ELEVATION.panel}`)
  // Transport deck: raised chassis panel with a dark seam above it
  assert.deepEqual(rule('.fullscreen #playerContent'), { 'background-color': 'rgb(var(--color-bg))', 'background-image': P.CHASSIS_SHEEN, 'box-shadow': `${P.RAISED_BEVEL}, 0 -1px 0 rgb(var(--color-edge-dark))` })
  // Seams: transport vs secondary row (fullscreen), panel vs seek region (mini)
  assert.deepEqual(rule('.fullscreen #playerControls'), { 'box-shadow': P.ENGRAVED_SEPARATOR })
  assert.deepEqual(rule('#streamContainer:not(.fullscreen) #playerTrack'), { 'box-shadow': P.ENGRAVED_SEPARATOR_TOP })
  // Keys: exactly the key-cap primitive; pressed inverts it; unavailable keys get no cap
  assert.deepEqual(rule('#playerContent .player-key:not(.key-disabled)'), { ...P.KEY_CAP })
  assert.deepEqual(rule('#playerContent .player-key:not(.key-disabled):active'), { ...P.KEY_CAP_PRESSED })
  // Recessed displays keep their content-box well and squared radius, now with a recessed face
  for (const s of ['.fullscreen #playerTrack', '.fullscreen .total-track']) {
    assert.equal(rule(s)['background-image'], P.RECESSED_FACE, s)
    assert.equal(rule(s)['background-clip'], 'content-box', s)
    assert.equal(rule(s)['border-radius'], P.RADIUS.key, s)
  }
  // Mirror-image seam: two inset lines, never a size change
  const top = P.ENGRAVED_SEPARATOR_TOP.split(', ')
  assert.equal(top.length, 2)
  assert.match(top[0], /^inset 0 1px 0 rgb\(var\(--color-edge-dark\)\)$/)
  assert.match(top[1], /^inset 0 2px 0 rgb\(var\(--color-edge-light\) \/ 0\.\d+\)$/)
})

test('Gate B readouts: sleep countdown is a phosphor readout in LLAMA only; success keeps its meaning', () => {
  const root = engine.themeSelector('llama')
  const rules = presets.presentationRules([llama()])
  assert.deepEqual(rules[`${root} #playerContent .sleep-readout`], { color: 'rgb(var(--color-accent))' })
  // No LLAMA rule repaints success semantics anywhere
  for (const [selector, declarations] of Object.entries(rules)) {
    assert.doesNotMatch(selector, /success/, selector)
    for (const value of Object.values(declarations)) assert.doesNotMatch(value, /--color-success/, selector)
  }
})

test('Gate B pending seek stays the played-progress amber but segmented, distinct from the settled bar', async () => {
  const root = engine.themeSelector('llama')
  const rules = presets.presentationRules([llama()])
  const pending = rules[`${root} #playerTrack .bg-track-cursor.bg-yellow-300`]
  const settled = rules[`${root} #playerTrack .bg-track-cursor.bg-gray-200`]
  assert.deepEqual(settled, { 'background-color': 'rgb(var(--color-track-cursor))' })
  assert.equal(pending['background-color'], 'transparent')
  assert.match(pending['background-image'], /^repeating-linear-gradient\(90deg, rgb\(var\(--color-track-cursor\)\) 0 \d+px, rgb\(var\(--color-track-cursor\) \/ 0\.\d+\) \d+px \d+px\)$/)
  // The seek code still toggles exactly these two state classes on the played bar
  const player = await read('../components/app/AudioPlayer.vue')
  assert.match(player, /this\.\$refs\.playedTrack\.classList\.remove\('bg-gray-200'\)\s*this\.\$refs\.playedTrack\.classList\.add\('bg-yellow-300'\)/)
  assert.match(player, /this\.\$refs\.playedTrack\.classList\.remove\('bg-yellow-300'\)\s*this\.\$refs\.playedTrack\.classList\.add\('bg-gray-200'\)/)
})

test('Gate B semantic hooks: player keys, unavailable state and sleep readout are marked in the player template', async () => {
  const player = await read('../components/app/AudioPlayer.vue')
  const template = player.slice(0, player.indexOf('</template>'))
  // Eight keys: chapter start/end, both jumps, and queue, bookmark, sleep, chapters in the secondary row
  assert.equal((template.match(/class="player-key /g) || []).length, 8)
  assert.equal((template.match(/class="player-key [^"]*next-icon/g) || []).length, 2)
  assert.equal((template.match(/class="player-key [^"]*jump-icon/g) || []).length, 2)
  assert.match(template, /v-if="playerSettings\.showQueueIcon" class="player-key relative cursor-pointer"/)
  assert.match(template, /class="player-key material-symbols text-3xl text-fg-muted cursor-pointer" :class="\{ fill: bookmarks\.length \}"/)
  assert.match(template, /<svg v-if="!sleepTimerRunning" xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="player-key h-7 w-7/)
  assert.match(template, /class="player-key material-symbols text-3xl text-fg cursor-pointer" :class="chapters\.length \? 'text-opacity-75' : 'text-opacity-10 key-disabled'"/)
  // Unavailable keys are marked together with the existing dimmed glyph state, never instead of it
  assert.equal((template.match(/'text-opacity-10 key-disabled'/g) || []).length, 5)
  assert.doesNotMatch(template, /'text-opacity-10'/)
  // The invisible podcast placeholder, the speed readout and the round play button are not keys
  assert.match(template, /<span v-else class="material-symbols text-3xl text-white text-opacity-0">bookmark<\/span>/)
  assert.match(template, /<span class="font-mono text-fg-muted cursor-pointer" style="font-size: 1\.35rem"/)
  assert.doesNotMatch(template, /player-key[^"]*play-btn|play-btn[^"]*player-key/)
  assert.match(template, /<p class="sleep-readout text-xl font-mono text-success">/)
  // The geometry the hooks sit on is unchanged: 120px mini-player, 200px fullscreen panel, control sizes
  const style = player.slice(player.indexOf('<style>'))
  assert.match(style, /\.playerContainer \{\s*height: 120px;\s*\}/)
  assert.match(style, /\.fullscreen \.playerContainer \{\s*height: 200px;\s*\}/)
  assert.match(style, /#playerControls \.play-btn \{[^}]*height: 40px;\s*width: 40px;/)
  assert.match(style, /\.fullscreen #playerControls \.play-btn \{\s*height: 65px;\s*width: 65px;/)
})

test('Gate B rules compile through Tailwind under the LLAMA root only', async () => {
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
  const root = "html[data-theme='llama']"
  assert.match(block(`${root} #playerContent .player-key:not(.key-disabled)`), /border-radius: 4px;[\s\S]*background-image: linear-gradient/)
  assert.match(block(`${root} #playerContent .sleep-readout`), /color: rgb\(var\(--color-accent\)\)/)
  assert.match(block(`${root} #playerTrack .bg-track-cursor.bg-yellow-300`), /background-image: repeating-linear-gradient/)
  assert.match(block(`${root} .fullscreen #playerContent`), /background-color: rgb\(var\(--color-bg\)\)/)
  assert.match(block(`${root} .cover-wrapper`), /border-radius: 2px/)
  for (const hook of ['player-key', 'key-disabled', 'sleep-readout']) assert.ok(!new RegExp(`(^|\\n|\\})\\s*\\.${hook}`).test(css), `no unscoped ${hook} rule`)
  for (const id of ['dark', 'black', 'light']) assert.deepEqual(presets.presentationRules([engine.getTheme(id)]), {}, id)
})

// --- Phase 2C Gate B.1: primary play control steel finish ---

test('Gate B.1 the round play button uses the stronger primary steel; every other steel surface keeps STEEL_SHEEN', () => {
  const P = presets.PRIMITIVES
  const root = engine.themeSelector('llama')
  const rules = presets.presentationRules([llama()])
  assert.deepEqual(rules[`${root} #playerControls .play-btn`], { 'background-image': P.PRIMARY_STEEL, 'box-shadow': `${P.RAISED_BEVEL}, 0 2px 4px rgb(0 0 0 / 0.55)` })
  // Same pressed behavior (inset bevel on :active); the face dims and inverts instead of dropping to the bare fill
  assert.deepEqual(rules[`${root} #playerControls .play-btn:active`], { 'background-image': P.PRIMARY_STEEL_PRESSED, 'box-shadow': P.PRESSED_BEVEL })
  // Only the play button uses the primary steel
  const users = Object.entries(rules)
    .filter(([, d]) => Object.values(d).some((v) => v === P.PRIMARY_STEEL || v === P.PRIMARY_STEEL_PRESSED))
    .map(([s]) => s)
  assert.deepEqual(users, [`${root} #playerControls .play-btn`, `${root} #playerControls .play-btn:active`])
  // Secondary keys and the other steel surfaces are unchanged
  assert.equal(P.KEY_CAP['background-image'], P.STEEL_SHEEN)
  assert.equal(P.STEEL_SHEEN, 'linear-gradient(180deg, rgb(var(--color-edge-light) / 0.18) 0%, rgb(var(--color-edge-light) / 0) 55%, rgb(0 0 0 / 0.18) 100%)')
  for (const s of ['#bookshelf-navbar', '.btn:not(:disabled)', '.icon-btn.border:not(:disabled)', '.bookshelfDivider']) assert.equal(rules[`${root} ${s}`]['background-image'], P.STEEL_SHEEN, s)
  // Lit from the upper left like the bevels; the falloff darkens downward, and pressed inverts and dims it
  assert.match(P.PRIMARY_STEEL, /^radial-gradient\(circle at \d+% \d+%, rgb\(var\(--color-edge-light\) \/ 0\.\d+\) 0%, rgb\(var\(--color-edge-light\) \/ 0\) \d+%\), linear-gradient\(180deg, /)
  const alphas = (v) => [...v.matchAll(/--color-edge-light\) \/ (0\.\d+)\)/g)].map((m) => Number(m[1]))
  const fall = alphas(P.PRIMARY_STEEL.slice(P.PRIMARY_STEEL.indexOf('linear-gradient')))
  assert.ok(fall.length === 3 && fall[0] > fall[1] && fall[1] > fall[2], 'top-lit falloff')
  const pressed = alphas(P.PRIMARY_STEEL_PRESSED)
  assert.ok(pressed.length === 2 && pressed[0] < pressed[1] && pressed[1] < fall[0], 'pressed: inverted and dimmer')
  // The white glyph keeps at least 3:1 against the brightest face point (falloff top plus the full highlight over surface.raised)
  const t = llama().tokens
  const edge = presets.equipmentDerivedDeclarations(t)['--color-edge-light'].split(' ').map(Number)
  const over = (base, a) => base.map((c, i) => c + (edge[i] - c) * a)
  const highlight = alphas(P.PRIMARY_STEEL)[0]
  const brightest = over(over(t['surface.raised'], fall[0]), highlight)
  assert.ok(contrast([255, 255, 255], brightest) >= 3, `glyph contrast ${contrast([255, 255, 255], brightest)}`)
  for (const id of ['dark', 'black', 'light']) assert.deepEqual(presets.presentationRules([engine.getTheme(id)]), {}, id)
})

// --- Phase 2C Gate C: Up Next and player-adjacent overlays (paint only) ---

const GATE_C_HOOKS = {
  '../components/modals/QueueModal.vue': [/class="queue-panel /, /<div v-if="nowPlayingDisplay" class="queue-current /, /<li v-for="item in upcomingLocal" :key="itemKey\(item\)" class="queue-row /],
  '../components/modals/PlaybackSpeedModal.vue': [/class="playback-option-panel /, /:class="rate === selected \? 'bg-bg-hover\/50 option-selected' : ''"/, /class="option-panel-footer /, /<p class="speed-readout text-xl">/],
  '../components/modals/SleepTimerModal.vue': [/class="playback-option-panel /, /<p class="sleep-readout text-2xl font-mono text-center">\{\{ timeRemainingPretty \}\}<\/p>/],
  '../components/modals/BookmarksModal.vue': [/<div class="bookmarks-list w-full h-full" v-else>/],
  '../components/modals/bookmarks/BookmarkItem.vue': [/class="bookmark-row /, /:class="highlight \? 'bg-bg bg-opacity-60 bookmark-current' : ' bg-opacity-20'"/, /<i class="bookmark-icon material-symbols/]
}

test('Gate C semantic hooks are present in the player-adjacent overlay templates; behavior hooks are untouched', async () => {
  for (const [file, patterns] of Object.entries(GATE_C_HOOKS)) {
    const source = await read(file)
    for (const pattern of patterns) assert.match(source, pattern, `${file}: ${pattern}`)
  }
  // Drag/reorder and removal wiring stay exactly as they were
  const queue = await read('../components/modals/QueueModal.vue')
  assert.match(queue, /<draggable v-else v-model="upcomingLocal" tag="ul" handle="\.drag-handle" @end="onDragEnd">/)
  assert.match(queue, /<span class="material-symbols drag-handle text-fg-muted cursor-grab text-xl mr-1">drag_indicator<\/span>/)
  assert.match(queue, /@click\.stop="\$emit\('remove', item\)"/)
  // The overlays carrying these hooks are only used by the player container (scoped, not app-wide)
  const container = await read('../components/app/AudioPlayerContainer.vue')
  for (const tag of ['modals-queue-modal', 'modals-playback-speed-modal', 'modals-sleep-timer-modal', 'modals-bookmarks-modal']) assert.match(container, new RegExp(`<${tag} `), tag)
})

test('Gate C rules: paint only, built from the shared primitives, under the LLAMA root', () => {
  const P = presets.PRIMITIVES
  const root = engine.themeSelector('llama')
  const rules = presets.presentationRules([llama()])
  const rule = (s) => rules[`${root} ${s}`]
  const gateC = Object.entries(rules).filter(([s]) => /queue-current|queue-row|playback-option-panel|speed-readout|\.modal \.sleep-readout|bookmark/.test(s))
  assert.ok(gateC.length >= 14, `${gateC.length} rules`)
  for (const [selector, declarations] of gateC) {
    assert.ok(selector.startsWith(`${root} .modal `), selector)
    for (const [property, value] of Object.entries(declarations)) {
      assert.match(property, /^(background-color|background-image|box-shadow|border-radius|border-color|color)$/, `${selector}: ${property}`)
      assert.match(value, SAFE_VALUE, `${selector}: ${value}`)
    }
  }
  // Recessed list wells inside the chassis panels
  for (const s of ['.modal .playback-option-panel ul[role=listbox]', '.modal .bookmarks-list']) assert.deepEqual(rule(s), { 'background-color': 'rgb(var(--color-recessed))', 'box-shadow': P.RECESSED_WELL }, s)
  // Engraved seams between rows (never after the last row)
  for (const s of ['.modal .queue-panel .queue-row:not(:last-child)', '.modal .playback-option-panel li[role=option]:not(:last-child)', '.modal .bookmark-row:not(:last-child)']) assert.deepEqual(rule(s), { 'box-shadow': P.ENGRAVED_SEPARATOR }, s)
  // Selected speed: a selected equipment key (pressed + accent ring) on a lit row
  assert.deepEqual(rule('.modal .playback-option-panel li[role=option].option-selected'), { 'background-color': 'rgb(var(--color-bg))', ...P.SELECTED_KEY })
  // Speed steppers are equipment keys on a raised chassis strip
  assert.deepEqual(rule('.modal .playback-option-panel .icon-num-btn:not(:disabled)'), { ...P.KEY_CAP })
  assert.deepEqual(rule('.modal .playback-option-panel .icon-num-btn:not(:disabled):active'), { ...P.KEY_CAP_PRESSED })
  assert.equal(rule('.modal .playback-option-panel .option-panel-footer')['background-image'], P.CHASSIS_SHEEN)
  assert.equal(rule('.modal .playback-option-panel .option-panel-footer')['box-shadow'], P.RAISED_BEVEL)
})

test('Gate C current entries: lit, pressed in and marked with the played-progress amber like Chapters', () => {
  const P = presets.PRIMITIVES
  const root = engine.themeSelector('llama')
  const rules = presets.presentationRules([llama()])
  const marker = 'inset 2px 0 0 rgb(var(--color-track-cursor))'
  for (const s of ['.modal .queue-panel .queue-current', '.modal .bookmark-row.bookmark-current']) {
    const r = rules[`${root} ${s}`]
    assert.equal(r['background-color'], 'rgb(var(--color-bg))', s) // the same lit surface as Chapters' current row
    assert.ok(r['box-shadow'].startsWith(`${marker}, ${P.PRESSED_BEVEL}`), s) // amber marker + pressed: not color alone
  }
  // Chapters' marker is the same amber, 2px wide (w-0.5)
  assert.deepEqual(rules[`${root} .modal .chapters-panel li > .bg-yellow-400`], { 'background-color': 'rgb(var(--color-track-cursor))' })
  // The bookmark at the current position is amber (position), not success green; live readouts are accent green
  assert.deepEqual(rules[`${root} .modal .bookmark-current .bookmark-icon`], { color: 'rgb(var(--color-track-cursor))' })
  for (const s of ['.modal .speed-readout', '.modal .sleep-readout']) assert.deepEqual(rules[`${root} ${s}`], { color: 'rgb(var(--color-accent))' }, s)
})

test('Gate C cascade: state rules outrank the row seams they share an element with', () => {
  const root = engine.themeSelector('llama')
  const order = Object.keys(presets.presentationRules([llama()]))
  // [ids, classes/attributes/pseudo-classes, elements] for the simple selectors used by the recipe
  const specificity = (selector) => {
    const s = selector.replace(/:not\(([^)]*)\)/g, ' $1')
    return [(s.match(/#[\w-]+/g) || []).length, (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!not)[\w-]+/g) || []).length, (s.match(/(^|[\s>+~])[a-z]+/g) || []).length]
  }
  const wins = (a, b) => {
    const [x, y] = [specificity(a), specificity(b)]
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
    return order.indexOf(a) > order.indexOf(b)
  }
  const pairs = [
    ['.modal .playback-option-panel li[role=option].option-selected', '.modal .playback-option-panel li[role=option]:not(:last-child)'],
    ['.modal .bookmark-row.bookmark-current', '.modal .bookmark-row:not(:last-child)']
  ]
  for (const [state, seam] of pairs) assert.ok(wins(`${root} ${state}`, `${root} ${seam}`), `${state} must win over ${seam}`)
})

test('Gate C rules compile through Tailwind; Dark, Black and Light still get no presentation rules', async () => {
  const postcss = require('postcss')
  const tailwind = require('tailwindcss')
  const config = require('../tailwind.config.js')
  const source = await read('../assets/tailwind.css')
  const content = config.content.map((glob) => new URL(`../${glob}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  const { css } = await postcss([tailwind({ ...config, content })]).process(source, { from: undefined })
  const root = "html[data-theme='llama']"
  for (const s of ['.modal .queue-panel .queue-current', '.modal .playback-option-panel li[role=option].option-selected', '.modal .playback-option-panel ul[role=listbox]', '.modal .bookmark-current .bookmark-icon', '.modal .speed-readout']) assert.ok(css.includes(`${root} ${s} {`), s)
  for (const hook of ['queue-current', 'queue-row', 'playback-option-panel', 'option-selected', 'bookmark-row', 'bookmark-current', 'bookmarks-list', 'speed-readout']) assert.ok(!new RegExp(`(^|\\n|\\})\\s*\\.${hook}\\b`).test(css), `no unscoped ${hook} rule`)
  for (const id of ['dark', 'black', 'light']) assert.deepEqual(presets.presentationRules([engine.getTheme(id)]), {}, id)
})
