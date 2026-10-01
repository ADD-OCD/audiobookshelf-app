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
// Primary playback control (the round play/pause button): a stronger, near-opaque brushed-steel face so it reads
// as silver-gray metal against the blue-gray chassis. It composes over the control's own fill: an upper-left
// specular highlight (same light source as the bevels) over a top-to-bottom falloff. Secondary keys keep the
// subtler STEEL_SHEEN. Pressed: the face dims and its falloff inverts (lit from below while pushed in)
const PRIMARY_STEEL = 'radial-gradient(circle at 35% 25%, rgb(var(--color-edge-light) / 0.4) 0%, rgb(var(--color-edge-light) / 0) 55%), linear-gradient(180deg, rgb(var(--color-edge-light) / 0.72) 0%, rgb(var(--color-edge-light) / 0.5) 50%, rgb(var(--color-edge-light) / 0.28) 100%)'
const PRIMARY_STEEL_PRESSED = 'linear-gradient(180deg, rgb(var(--color-edge-light) / 0.3) 0%, rgb(var(--color-edge-light) / 0.45) 100%)'
const CHASSIS_SHEEN = 'linear-gradient(180deg, rgb(var(--color-edge-light) / 0.1) 0%, rgb(var(--color-edge-light) / 0) 40%, rgb(0 0 0 / 0.2) 100%)'
const ARTWORK_FRAME = '0 0 0 1px rgb(var(--color-edge-dark)), 0 0 0 2px rgb(var(--color-edge-light) / 0.45)'
// A seam cut into the bottom of an element: dark inset line with a faint light return line below it.
// Drawn inside the element's own box (inset), so row dimensions never change.
const ENGRAVED_SEPARATOR = 'inset 0 -1px 0 rgb(var(--color-edge-light) / 0.12), inset 0 -2px 0 rgb(var(--color-edge-dark))'
// The same seam cut into the top of an element (dark line on top, faint light return under it)
const ENGRAVED_SEPARATOR_TOP = 'inset 0 1px 0 rgb(var(--color-edge-dark)), inset 0 2px 0 rgb(var(--color-edge-light) / 0.12)'
// Recessed display face as a background layer: dark upper lip with an inner shade falling down and a faint
// light lower lip. Unlike an inset box-shadow it follows background-clip, so it fits a content-box well
const RECESSED_FACE = 'linear-gradient(180deg, rgb(var(--color-edge-dark)) 0, rgb(var(--color-edge-dark)) 1px, rgb(0 0 0 / 0.4) 1px, rgb(0 0 0 / 0) 6px, rgb(0 0 0 / 0) calc(100% - 1px), rgb(var(--color-edge-light) / 0.22) calc(100% - 1px))'

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

// Current playback entry in a list (Up Next, bookmarks): a 2px amber edge along the left inside the row, the
// same played-progress amber and width as Chapters' current-chapter marker, without adding an element
const CURRENT_MARKER = 'inset 2px 0 0 rgb(var(--color-track-cursor))'

const PRIMITIVES = Object.freeze({ RADIUS, ELEVATION, RAISED_BEVEL, PRESSED_BEVEL, RECESSED_WELL, STEEL_SHEEN, PRIMARY_STEEL, PRIMARY_STEEL_PRESSED, CHASSIS_SHEEN, ARTWORK_FRAME, ENGRAVED_SEPARATOR, ENGRAVED_SEPARATOR_TOP, RECESSED_FACE, KEY_CAP, KEY_CAP_PRESSED, SELECTED_KEY })

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

  // --- Player-adjacent overlays (Gate C): Up Next, playback speed, sleep timer, bookmarks ---
  // Hierarchy: raised chassis panel (the existing dialog rule) > recessed list well > engraved row seams >
  // current/selected state. Rows stay flat display entries, never a stack of keys.
  // Up Next: the Now Playing block is the lit current entry, matching Chapters' current row (lit + amber
  // left marker), pressed in so it reads by shape as well as color; its divider becomes an engraved seam
  ['.modal .queue-panel .queue-current', { 'background-color': 'rgb(var(--color-bg))', 'border-color': 'rgb(var(--color-edge-dark))', 'box-shadow': `${CURRENT_MARKER}, ${PRESSED_BEVEL}, inset 0 -1px 0 rgb(var(--color-edge-light) / 0.12)` }],
  ['.modal .queue-panel .queue-row:not(:last-child)', { 'box-shadow': ENGRAVED_SEPARATOR }],
  // Speed and sleep option lists: a recessed well inside the chassis panel, seamed rows, and the selected
  // speed as a selected equipment key (pressed in, accent ring) on a lit row instead of a flat wash
  ['.modal .playback-option-panel ul[role=listbox]', { 'background-color': 'rgb(var(--color-recessed))', 'box-shadow': RECESSED_WELL }],
  ['.modal .playback-option-panel li[role=option]:not(:last-child)', { 'box-shadow': ENGRAVED_SEPARATOR }],
  ['.modal .playback-option-panel li[role=option].option-selected', { 'background-color': 'rgb(var(--color-bg))', ...SELECTED_KEY }],
  // Speed stepper strip: a raised chassis strip under the well; its steppers are equipment keys
  ['.modal .playback-option-panel .option-panel-footer', { 'background-image': CHASSIS_SHEEN, 'border-color': 'rgb(var(--color-edge-dark))', 'box-shadow': RAISED_BEVEL }],
  ['.modal .playback-option-panel .icon-num-btn:not(:disabled)', KEY_CAP],
  ['.modal .playback-option-panel .icon-num-btn:not(:disabled):active', KEY_CAP_PRESSED],
  // Live readouts in these overlays: the current speed and the running sleep countdown
  ['.modal .speed-readout', { color: 'rgb(var(--color-accent))' }],
  ['.modal .sleep-readout', { color: 'rgb(var(--color-accent))' }],
  // Bookmarks: recessed list with seamed rows; the bookmark at the current position is a lit, pressed entry
  // with the amber position marker, and its icon is amber (current position), not success green
  ['.modal .bookmarks-list', { 'background-color': 'rgb(var(--color-recessed))', 'box-shadow': RECESSED_WELL }],
  ['.modal .bookmark-row:not(:last-child)', { 'box-shadow': ENGRAVED_SEPARATOR }],
  ['.modal .bookmark-row.bookmark-current', { 'background-color': 'rgb(var(--color-bg))', 'box-shadow': `${CURRENT_MARKER}, ${PRESSED_BEVEL}` }],
  ['.modal .bookmark-current .bookmark-icon', { color: 'rgb(var(--color-track-cursor))' }],

  // Side drawer: chassis edge facing the page
  ['.layout-wrapper .w-64.bg-bg', { 'background-image': CHASSIS_SHEEN, 'box-shadow': 'inset 1px 0 0 rgb(var(--color-edge-light) / 0.45), -2px 0 8px rgb(0 0 0 / 0.5)' }],

  // Artwork: thin outer frame (outside the image, so the artwork stays fully visible and unresized).
  // Card artwork is marked by the `card-artwork` hook: the grid card itself (it is the cover) and, in list
  // rows, only the cover box, never the whole row
  ['.cover-wrapper', { 'box-shadow': ARTWORK_FRAME, 'border-radius': RADIUS.frame }],
  ['.card-artwork', { 'box-shadow': `${ARTWORK_FRAME}, ${ELEVATION.panel}` }],

  // Player artwork uses the squared frame radius above (mini 3px, fullscreen 16px before); same box, crop and
  // aspect ratio. Fullscreen artwork sits mounted on the chassis like card artwork
  ['.fullscreen .cover-wrapper', { 'box-shadow': `${ARTWORK_FRAME}, ${ELEVATION.panel}` }],
  // Fullscreen transport deck: the existing bottom player panel becomes a raised chassis panel (sheen, light
  // top edge, dark seam above it against the artwork zone). Same box; the controls inside are untouched
  ['.fullscreen #playerContent', { 'background-color': 'rgb(var(--color-bg))', 'background-image': CHASSIS_SHEEN, 'box-shadow': `${RAISED_BEVEL}, 0 -1px 0 rgb(var(--color-edge-dark))` }],
  // Panel seam between the primary transport row and the secondary control row
  ['.fullscreen #playerControls', { 'box-shadow': ENGRAVED_SEPARATOR }],
  // Mini-player: seam across the panel above the seek region
  ['#streamContainer:not(.fullscreen) #playerTrack', { 'box-shadow': ENGRAVED_SEPARATOR_TOP }],
  // Physical keys: the transport and secondary controls marked with the player-key hook get a key cap on their
  // own box (pressed inverts it). A control that is currently unavailable (key-disabled) has no cap at all,
  // so it reads flat/unavailable by shape, not only by its dimmed glyph. Readouts (speed, sleep countdown)
  // and the round play button are not player keys
  ['#playerContent .player-key:not(.key-disabled)', KEY_CAP],
  ['#playerContent .player-key:not(.key-disabled):active', KEY_CAP_PRESSED],
  // Live sleep countdown is a readout: phosphor green like the other readouts (state.success keeps meaning
  // finished/complete everywhere else)
  ['#playerContent .sleep-readout', { color: 'rgb(var(--color-accent))' }],

  // Player: recessed display behind the fullscreen seek/readout rows (content box only: padding stays chassis)
  ['.fullscreen #playerTrack', { 'background-color': 'rgb(var(--color-recessed))', 'background-image': RECESSED_FACE, 'background-clip': 'content-box', 'border-radius': RADIUS.key }],
  ['.fullscreen .total-track', { 'background-color': 'rgb(var(--color-recessed))', 'background-image': RECESSED_FACE, 'background-clip': 'content-box', 'border-radius': RADIUS.key }],
  // Seek channels read as inset slots; the played portion stays the amber token even after the player's
  // seek code swaps in its settled-state class (bg-gray-200)
  ['#playerTrack div.relative.rounded-full', { 'box-shadow': 'inset 1px 1px 0 rgb(var(--color-edge-dark)), inset -1px -1px 0 rgb(var(--color-edge-light) / 0.3)' }],
  ['.total-track div.relative.rounded-full', { 'box-shadow': 'inset 1px 1px 0 rgb(var(--color-edge-dark)), inset -1px -1px 0 rgb(var(--color-edge-light) / 0.3)' }],
  ['#playerTrack .bg-track-cursor.bg-gray-200', { 'background-color': 'rgb(var(--color-track-cursor))' }],
  // Pending seek (the seek code's bg-yellow-300 state until playback confirms the position): the same amber,
  // broken into segments, so it reads as not-yet-settled by pattern rather than by a near-identical yellow
  ['#playerTrack .bg-track-cursor.bg-yellow-300', { 'background-color': 'transparent', 'background-image': 'repeating-linear-gradient(90deg, rgb(var(--color-track-cursor)) 0 4px, rgb(var(--color-track-cursor) / 0.3) 4px 7px)' }],
  ['#playerTrack .pointer-events-auto > .bg-track-cursor', { 'box-shadow': '0 0 0 1px rgb(var(--color-edge-dark)), 0 1px 2px rgb(0 0 0 / 0.6)' }],
  // Phosphor-green readouts: timestamps, playback speed and the playback-method label (titles stay neutral)
  ['#playerTrack p.font-mono', { color: 'rgb(var(--color-accent))' }],
  ['.total-track p.font-mono', { color: 'rgb(var(--color-accent))' }],
  ['#playerContent span.font-mono', { color: 'rgb(var(--color-accent))' }],
  ['#streamContainer p.tracking-widest', { color: 'rgb(var(--color-accent) / 0.85)' }],
  // Transport: steel play button, raised; pressed = inset (other transport glyphs keep their look)
  ['#playerControls .play-btn', { 'background-image': PRIMARY_STEEL, 'box-shadow': `${RAISED_BEVEL}, 0 2px 4px rgb(0 0 0 / 0.55)` }],
  ['#playerControls .play-btn:active', { 'background-image': PRIMARY_STEEL_PRESSED, 'box-shadow': PRESSED_BEVEL }],
  // Collapsed mini-player: chassis top edge (same footprint)
  ['#streamContainer:not(.fullscreen) #playerContent', { 'box-shadow': 'inset 0 1px 0 rgb(var(--color-edge-light) / 0.45), 0 -8px 8px rgb(0 0 0 / 0.33)' }],

  // Bookshelf view: the wood material becomes graphite/blue-gray equipment (same boxes, labels and layout)
  ['.bookshelfRow', { 'background-image': 'linear-gradient(180deg, rgb(var(--color-primary)) 0%, rgb(var(--color-bg)) 100%)' }],
  ['.bookshelfDivider', { 'background-color': 'rgb(var(--color-secondary))', 'background-image': STEEL_SHEEN, 'box-shadow': `${RAISED_BEVEL}, 2px 10px 8px rgb(0 0 0 / 0.5)` }],
  ['.shinyBlack', { 'background-color': 'rgb(var(--color-recessed))', 'background-image': 'none', 'border-color': 'rgb(var(--color-border))', color: 'rgb(var(--color-fg))' }],
  ['.altBookshelfLabel', { 'background-color': 'rgb(var(--color-recessed))', 'background-image': 'none', 'border-color': 'rgb(var(--color-border))', color: 'rgb(var(--color-fg))' }],

  // --- Browsing and detail surfaces (Gate D) ---
  // Content stays dominant: artwork is mounted, information sits in recessed displays, tappable section
  // headers are raised strips, and only real controls become keys. Card artwork for every entity type uses
  // the card-artwork hook above (series/collection/playlist covers, author portraits, group-table row covers)
  // on its artwork box only, never a card root or row.
  // Home sections: an engraved seam closes each shelf (drawn under the shelf content, so the standard
  // shelf's own divider covers it and it only shows in the alternative view)
  ['.shelf-section', { 'box-shadow': ENGRAVED_SEPARATOR }],
  // Bookshelf toolbar: a chassis strip under the navigation bar, seamed off from the content below
  ['.browse-toolbar', { 'background-image': CHASSIS_SHEEN, 'box-shadow': ENGRAVED_SEPARATOR }],
  // Active-filter indicator: an active state, so the accent (success green only means completion)
  ['.browse-toolbar .filter-indicator', { 'background-color': 'rgb(var(--color-accent))', 'border-color': 'rgb(var(--color-edge-dark))' }],
  // Library selector (app bar): a physical key; pressed inverts it
  ['.library-selector', KEY_CAP],
  ['.library-selector:active', KEY_CAP_PRESSED],
  // Library list: recessed well, seamed rows; the current library is a selected key (pressed, accent ring) on
  // a lit row, and its marker uses the accent instead of warning orange (selection is not a warning)
  ['.modal .library-option-panel ul[role=listbox]', { 'background-color': 'rgb(var(--color-recessed))', 'box-shadow': RECESSED_WELL }],
  ['.modal .library-option-panel li[role=option]:not(:last-child)', { 'box-shadow': ENGRAVED_SEPARATOR }],
  ['.modal .library-option-panel li[role=option].option-selected', { 'background-color': 'rgb(var(--color-bg))', ...SELECTED_KEY }],
  ['.modal .library-option-panel .option-marker', { 'background-color': 'rgb(var(--color-accent))' }],
  // Detail artwork (item, collection and playlist pages): the same mounted frame as card artwork
  ['.detail-artwork', { 'border-radius': RADIUS.frame, 'box-shadow': `${ARTWORK_FRAME}, ${ELEVATION.panel}` }],
  // Item progress: a recessed information display (text and values unchanged)
  ['.detail-progress', { 'background-color': 'rgb(var(--color-recessed))', 'border-radius': RADIUS.key, 'box-shadow': RECESSED_WELL }],
  // Tappable section headers (chapters/tracks/ebook files, collection/playlist items): raised chassis strips
  ['.section-bar', { 'background-image': CHASSIS_SHEEN, 'box-shadow': RAISED_BEVEL }],
  // Their count badge and the total-duration value are small recessed readouts
  ['.section-bar .section-count', { 'background-color': 'rgb(var(--color-recessed))', 'box-shadow': RECESSED_WELL, color: 'rgb(var(--color-accent))' }],
  ['.section-bar .section-readout', { color: 'rgb(var(--color-accent))' }],
  // Detail tables (assets/app.css tracksTable): a recessed display with a dark zebra instead of bright strips
  ['.tracksTable tr', { 'background-color': 'rgb(var(--color-recessed))' }],
  ['.tracksTable tr:nth-child(even)', { 'background-color': 'rgb(var(--color-primary))' }],
  // Group detail items (collection/playlist): a recessed well; collection rows are seamed display entries
  ['.group-items', { 'background-color': 'rgb(var(--color-recessed))', 'box-shadow': RECESSED_WELL }],
  ['.group-items .group-row:not(:last-child)', { 'box-shadow': ENGRAVED_SEPARATOR }],
  // Row play buttons are real controls: equipment keys (glyph color and size unchanged)
  ['.row-play-btn', KEY_CAP],
  ['.row-play-btn:active', KEY_CAP_PRESSED],

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
