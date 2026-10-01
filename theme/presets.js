/**
 * Fixed presentation recipes selected by the validated `presentation.finish` token.
 *
 * - 'standard' produces no rules at all, so Dark/Black/Light CSS is exactly the token variables.
 * - 'equipment' is a repository-owned recipe (bevels, recessed wells, ...). Its selectors, property
 *   names and structure live here, in code. Theme data only chooses the recipe and supplies validated
 *   colors: rules reference token variables, and the derived edge colors below are computed from
 *   validated channels with fixed blend factors that theme data cannot influence.
 *
 * Selectors are built only from validated built-in theme ids (engine.themeSelector).
 * CommonJS on purpose: used by tailwind.config.js at build time.
 */
const engine = require('./engine')

const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]
// Fixed, repository-owned blend factors (not theme data)
const EDGE_LIGHT_TOWARD_WHITE = 0.45
const EDGE_DARK_TOWARD_BLACK = 0.6

const mix = (from, to, t) => from.map((channel, i) => Math.round(channel + (to[i] - channel) * t))
const channels = (c) => `${c[0]} ${c[1]} ${c[2]}`

/** Colors the equipment recipe derives from validated theme tokens. */
function equipmentDerivedDeclarations(tokens) {
  return {
    // Lighter top/left bevel edge, from the raised surface
    '--color-edge-light': channels(mix(tokens['surface.raised'], WHITE, EDGE_LIGHT_TOWARD_WHITE)),
    // Darker bottom/right bevel edge, from the base surface
    '--color-edge-dark': channels(mix(tokens['surface.base'], BLACK, EDGE_DARK_TOWARD_BLACK))
  }
}

/**
 * The equipment recipe: [selector suffix relative to the theme root, declarations].
 * An empty suffix targets the theme root itself. Values may only reference CSS variables emitted by
 * the token layer or by equipmentDerivedDeclarations.
 */
// --- Shared equipment primitives ---
// Paint-only building blocks (no border widths, padding, transforms or layout properties). One light source:
// light upper/left edges, dark lower/right edges, drop shadows falling down. Later gates compose rules from
// these instead of adding one-off values. All are fixed repository values; theme data cannot supply any.

// Radius scale: squared, restrained geometry. Circular playback controls keep their own full rounding.
const RADIUS = Object.freeze({
  frame: '2px', // artwork frames and fine detail
  key: '4px', // wells, panels and equipment keys
  round: '9999px' // circular controls only (e.g. the play button)
})

// Edge treatments
const RAISED_BEVEL = 'inset 1px 1px 0 rgb(var(--color-edge-light) / 0.55), inset -1px -1px 0 rgb(var(--color-edge-dark))'
const PRESSED_BEVEL = 'inset 1px 1px 0 rgb(var(--color-edge-dark)), inset -1px -1px 0 rgb(var(--color-edge-light) / 0.35)'
const RECESSED_WELL = 'inset 1px 1px 0 rgb(var(--color-edge-dark)), inset -1px -1px 0 rgb(var(--color-edge-light) / 0.25), inset 0 2px 6px rgb(0 0 0 / 0.45)'
const STEEL_SHEEN = 'linear-gradient(180deg, rgb(var(--color-edge-light) / 0.18) 0%, rgb(var(--color-edge-light) / 0) 55%, rgb(0 0 0 / 0.18) 100%)'
const CHASSIS_SHEEN = 'linear-gradient(180deg, rgb(var(--color-edge-light) / 0.1) 0%, rgb(var(--color-edge-light) / 0) 40%, rgb(0 0 0 / 0.2) 100%)'
const ARTWORK_FRAME = '0 0 0 1px rgb(var(--color-edge-dark)), 0 0 0 2px rgb(var(--color-edge-light) / 0.45)'
// A seam cut into the bottom of an element: dark inset line with a faint light return line below it.
// Drawn inside the element's own box (inset), so row dimensions never change.
const ENGRAVED_SEPARATOR = 'inset 0 -1px 0 rgb(var(--color-edge-light) / 0.12), inset 0 -2px 0 rgb(var(--color-edge-dark))'

// Elevation: the only drop shadows the recipe uses (each value matches what existing rules already used)
const ELEVATION = Object.freeze({
  raised: '0 2px 3px rgb(0 0 0 / 0.45)', // subtle raised surface: buttons
  panel: '3px 3px 6px rgb(0 0 0 / 0.5)', // equipment panel / framed object: cards, artwork
  overlay: '0 6px 16px rgb(0 0 0 / 0.55)' // prominent frame floating above the chassis: dialogs, menus
})

// Control states as complete declaration sets, for rules to reuse as-is
// Subtle key cap for an existing bare-glyph control: a bevelled steel face on the control's own box (no fill
// change, no size change); pressed inverts the bevel
const KEY_CAP = Object.freeze({ 'border-radius': RADIUS.key, 'background-image': STEEL_SHEEN, 'box-shadow': RAISED_BEVEL })
const KEY_CAP_PRESSED = Object.freeze({ 'background-image': 'none', 'box-shadow': PRESSED_BEVEL })
// Selected equipment key: pressed in (inset bevel and inner shade, so it reads as a different physical state,
// not just a color) with an accent ring inside the edge
const SELECTED_KEY = Object.freeze({
  'background-image': 'none',
  'box-shadow': `inset 0 0 0 1px rgb(var(--color-accent) / 0.9), ${PRESSED_BEVEL}, inset 0 2px 5px rgb(0 0 0 / 0.45)`
})

const PRIMITIVES = Object.freeze({ RADIUS, ELEVATION, RAISED_BEVEL, PRESSED_BEVEL, RECESSED_WELL, STEEL_SHEEN, CHASSIS_SHEEN, ARTWORK_FRAME, ENGRAVED_SEPARATOR, KEY_CAP, KEY_CAP_PRESSED, SELECTED_KEY })

const EQUIPMENT_RULES = [
  // Navigation chrome: bevelled chassis strips
  ['#appbar', { 'background-image': CHASSIS_SHEEN, 'box-shadow': `${RAISED_BEVEL}, 0 1px 0 rgb(var(--color-edge-dark))` }],
  ['#bookshelf-navbar', { 'background-image': STEEL_SHEEN, 'box-shadow': RAISED_BEVEL }],
  // Selected navigation tab reads as a pressed key (inset) with an accent underline, not color alone
  // (BookshelfNavBar binds bg-primary on the active tab; runtime-only router classes would be pruned by Tailwind)
  ['#bookshelf-navbar a.bg-primary', { 'background-image': 'none', 'box-shadow': `${PRESSED_BEVEL}, inset 0 -2px 0 rgb(var(--color-accent))` }],

  // Buttons: steel sheen over the existing (semantic) button color, raised; pressed = inset
  ['.btn:not(:disabled)', { 'background-image': STEEL_SHEEN, 'box-shadow': `${RAISED_BEVEL}, ${ELEVATION.raised}` }],
  ['.btn:not(:disabled):active', KEY_CAP_PRESSED],
  // Only the bordered icon buttons (IconBtn/ReadIconBtn add `border` unless borderless) are steel keys;
  // borderless icon buttons are intentionally bare glyphs and stay that way
  ['.icon-btn.border:not(:disabled)', { 'background-image': STEEL_SHEEN, 'box-shadow': RAISED_BEVEL }],
  ['.icon-btn.border:not(:disabled):active', KEY_CAP_PRESSED],

  // Text fields and selects: recessed display wells
  ['input:not([type=range]):not([type=checkbox]):not([type=radio])', { 'background-color': 'rgb(var(--color-recessed))', 'box-shadow': RECESSED_WELL }],
  ['textarea', { 'background-color': 'rgb(var(--color-recessed))', 'box-shadow': RECESSED_WELL }],

  // Dialog / menu panels: raised chassis
  ['.modal .rounded-lg.bg-primary', { 'background-image': CHASSIS_SHEEN, 'box-shadow': `${RAISED_BEVEL}, ${ELEVATION.overlay}` }],
  // Up Next list: a recessed playlist well inside the chassis
  ['.modal .queue-panel.rounded-lg.bg-primary', { 'background-color': 'rgb(var(--color-recessed))', 'background-image': 'none', 'box-shadow': `${RECESSED_WELL}, ${ELEVATION.overlay}` }],
  // Chapters list: the same recessed well under a blue-gray chassis header strip (ChaptersModal hook class)
  ['.modal .chapters-panel.bg-secondary', { 'background-color': 'rgb(var(--color-recessed))', 'box-shadow': `${RECESSED_WELL}, ${ELEVATION.overlay}` }],
  ['.modal .chapters-panel > .sticky.bg-secondary', { 'background-image': CHASSIS_SHEEN, 'box-shadow': `${RAISED_BEVEL}, 0 1px 0 rgb(var(--color-edge-dark))` }],
  ['.modal .chapters-panel > .sticky.bg-secondary.shadow-md', { 'box-shadow': `${RAISED_BEVEL}, 0 1px 0 rgb(var(--color-edge-dark)), 0 4px 8px rgb(0 0 0 / 0.5)` }],
  ['.modal .chapters-panel > .sticky p.text-fg-muted', { color: 'rgb(var(--color-fg) / 0.85)' }],
  // Current chapter: a lit row on the dark well (the amber marker stays)
  ['.modal .chapters-panel li.bg-primary', { 'background-color': 'rgb(var(--color-bg))' }],
  // Current-chapter marker: the same played-progress amber as the seek bar (same element, size and position)
  ['.modal .chapters-panel li > .bg-yellow-400', { 'background-color': 'rgb(var(--color-track-cursor))' }],

  // Side drawer: chassis edge facing the page
  ['.layout-wrapper .w-64.bg-bg', { 'background-image': CHASSIS_SHEEN, 'box-shadow': 'inset 1px 0 0 rgb(var(--color-edge-light) / 0.45), -2px 0 8px rgb(0 0 0 / 0.5)' }],

  // Artwork: thin outer frame (outside the image, so the artwork stays fully visible and unresized).
  // Card artwork is marked by the `card-artwork` hook: the grid card itself (it is the cover) and, in list
  // rows, only the cover box, never the whole row
  ['.cover-wrapper', { 'box-shadow': ARTWORK_FRAME }],
  ['.card-artwork', { 'box-shadow': `${ARTWORK_FRAME}, ${ELEVATION.panel}` }],

  // Player: recessed display behind the fullscreen seek/readout rows (content box only: padding stays chassis)
  ['.fullscreen #playerTrack', { 'background-color': 'rgb(var(--color-recessed))', 'background-clip': 'content-box', 'border-radius': RADIUS.key }],
  ['.fullscreen .total-track', { 'background-color': 'rgb(var(--color-recessed))', 'background-clip': 'content-box', 'border-radius': RADIUS.key }],
  // Seek channels read as inset slots; the played portion stays the amber token even after the player's
  // seek code swaps in its settled-state class (bg-gray-200); the pending-seek highlight is left as is
  ['#playerTrack div.relative.rounded-full', { 'box-shadow': 'inset 1px 1px 0 rgb(var(--color-edge-dark)), inset -1px -1px 0 rgb(var(--color-edge-light) / 0.3)' }],
  ['.total-track div.relative.rounded-full', { 'box-shadow': 'inset 1px 1px 0 rgb(var(--color-edge-dark)), inset -1px -1px 0 rgb(var(--color-edge-light) / 0.3)' }],
  ['#playerTrack .bg-track-cursor.bg-gray-200', { 'background-color': 'rgb(var(--color-track-cursor))' }],
  ['#playerTrack .pointer-events-auto > .bg-track-cursor', { 'box-shadow': '0 0 0 1px rgb(var(--color-edge-dark)), 0 1px 2px rgb(0 0 0 / 0.6)' }],
  // Phosphor-green readouts: timestamps, playback speed and the playback-method label (titles stay neutral)
  ['#playerTrack p.font-mono', { color: 'rgb(var(--color-accent))' }],
  ['.total-track p.font-mono', { color: 'rgb(var(--color-accent))' }],
  ['#playerContent span.font-mono', { color: 'rgb(var(--color-accent))' }],
  ['#streamContainer p.tracking-widest', { color: 'rgb(var(--color-accent) / 0.85)' }],
  // Transport: steel play button, raised; pressed = inset (other transport glyphs keep their look)
  ['#playerControls .play-btn', { 'background-image': STEEL_SHEEN, 'box-shadow': `${RAISED_BEVEL}, 0 2px 4px rgb(0 0 0 / 0.55)` }],
  ['#playerControls .play-btn:active', { 'background-image': 'none', 'box-shadow': PRESSED_BEVEL }],
  // Collapsed mini-player: chassis top edge (same footprint)
  ['#streamContainer:not(.fullscreen) #playerContent', { 'box-shadow': 'inset 0 1px 0 rgb(var(--color-edge-light) / 0.45), 0 -8px 8px rgb(0 0 0 / 0.33)' }],

  // Bookshelf view: the wood material becomes graphite/blue-gray equipment (same boxes, labels and layout)
  ['.bookshelfRow', { 'background-image': 'linear-gradient(180deg, rgb(var(--color-primary)) 0%, rgb(var(--color-bg)) 100%)' }],
  ['.bookshelfDivider', { 'background-color': 'rgb(var(--color-secondary))', 'background-image': STEEL_SHEEN, 'box-shadow': `${RAISED_BEVEL}, 2px 10px 8px rgb(0 0 0 / 0.5)` }],
  ['.shinyBlack', { 'background-color': 'rgb(var(--color-recessed))', 'background-image': 'none', 'border-color': 'rgb(var(--color-border))', color: 'rgb(var(--color-fg))' }],
  ['.altBookshelfLabel', { 'background-color': 'rgb(var(--color-recessed))', 'background-image': 'none', 'border-color': 'rgb(var(--color-border))', color: 'rgb(var(--color-fg))' }],

  // Toggle switch (ui/ToggleSwitch): recessed slot with a steel thumb; state still reads from thumb position
  ['.w-10.rounded-full.border-gray-400', { 'border-color': 'rgb(var(--color-border))', 'box-shadow': 'inset 1px 1px 0 rgb(var(--color-edge-dark)), inset 0 1px 3px rgb(0 0 0 / 0.5)' }],
  ['.w-10.rounded-full.border-gray-400.bg-primary', { 'background-color': 'rgb(var(--color-recessed))' }],
  ['.w-10.rounded-full.border-gray-400 > span.bg-white', { 'background-color': 'rgb(var(--color-edge-light))', 'background-image': STEEL_SHEEN, 'border-color': 'rgb(var(--color-edge-dark))' }],
  // Disabled thumb (bg-gray-300) must read dimmer than the enabled steel thumb, not brighter
  ['.w-10.rounded-full.border-gray-400 > span.bg-gray-300', { 'background-color': 'rgb(var(--color-bg-hover))', 'border-color': 'rgb(var(--color-edge-dark))' }],

  // Unfinished playback progress on book/series/list cards, playlist rows and the item cover uses the amber
  // played-progress token; finished (bg-success) and other yellow uses (badges, chapter marker) are untouched
  ['.absolute.bottom-0.left-0.z-10.bg-yellow-400', { 'background-color': 'rgb(var(--color-track-cursor))' }],

  // Contrast safety margin for the two tightest measured roles (LLAMA only, existing values, no geometry):
  // small uppercase muted section headers and inactive navigation icons use primary text at reduced alpha
  ['#content p.uppercase.text-fg-muted', { color: 'rgb(var(--color-fg) / 0.78)' }],
  ['#bookshelf-navbar a.text-fg-muted', { color: 'rgb(var(--color-fg) / 0.8)' }],

  // Visible focus for keyboard/switch access
  [':focus-visible', { outline: '2px solid rgb(var(--color-accent))', 'outline-offset': '2px' }]
]

const RECIPES = {
  standard: () => ({}),
  equipment: (theme) => {
    const root = engine.themeSelector(theme.id)
    const rules = { [root]: equipmentDerivedDeclarations(theme.tokens) }
    for (const [suffix, declarations] of EQUIPMENT_RULES) {
      const selector = suffix ? `${root} ${suffix}` : root
      rules[selector] = { ...(rules[selector] || {}), ...declarations }
    }
    return rules
  }
}

/** Fixed presentation rules for the given validated themes ({ selector: declarations }). */
function presentationRules(themes) {
  const rules = {}
  for (const theme of themes) {
    const recipe = RECIPES[theme.tokens['presentation.finish']]
    if (!recipe) continue // unreachable for validated themes; never guess
    for (const [selector, declarations] of Object.entries(recipe(theme))) {
      rules[selector] = { ...(rules[selector] || {}), ...declarations }
    }
  }
  return rules
}

const builtinPresentationRules = () => presentationRules(engine.THEMES)

module.exports = { presentationRules, builtinPresentationRules, equipmentDerivedDeclarations, EQUIPMENT_RULES, PRIMITIVES }
