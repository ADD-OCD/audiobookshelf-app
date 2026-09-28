/**
 * Built-in themes as data. Values reproduce the pre-token CSS exactly (assets/tailwind.css and the
 * status colors in tailwind.config.js as of c7a617bc); tests/theme.test.mjs guards that parity.
 *
 * `id` is also the persisted value (Preferences key `theme`) and the <html data-theme> attribute, so
 * existing saved selections keep working. `dark` is the default theme and also the fallback.
 */

// Status colors were identical across themes (previously fixed hex values in tailwind.config.js)
const states = {
  'accent.primary': [26, 214, 145], // #1ad691
  'state.success': [76, 175, 80], // #4CAF50
  'state.success-strong': [59, 138, 62], // #3b8a3e
  'state.warning': [251, 140, 0], // #FB8C00
  'state.error': [255, 82, 82], // #FF5252
  'state.info': [33, 150, 243] // #2196F3
}

// The native window behind the status/navigation bars is @color/background_dark (#232323) with light
// icons for every theme today, including Light. Recorded as-is; see docs/theme-architecture.md.
const systemBars = {
  'system.bar-icons': 'light',
  'system.status-bar': [35, 35, 35],
  'system.navigation-bar': [35, 35, 35]
}

// Existing themes keep today's presentation: no extra recipe, player/item chrome tinted from cover art
const standardPresentation = {
  'presentation.finish': 'standard',
  'presentation.cover-color': 'legacy'
}

const linear = (angle, ...stops) => ({ kind: 'linear', angle, stops: stops.map(([color, at]) => ({ color, at })) })
const solid = (color) => ({ kind: 'solid', color })

const dark = {
  id: 'dark',
  labelKey: 'LabelThemeDark',
  colorScheme: 'dark',
  tokens: {
    'surface.base': [35, 35, 35],
    'surface.content': [56, 56, 56],
    'surface.raised': [47, 48, 48],
    'surface.hover': [102, 104, 107],
    'surface.recessed': [35, 35, 35],
    'text.default': [255, 255, 255],
    'text.primary': [230, 237, 243],
    'text.muted': [142, 147, 153],
    'border.default': [75, 85, 89],
    'control.toggle': [56, 56, 56],
    'control.toggle-selected': [81, 82, 84],
    'progress.track': [107, 114, 128],
    'progress.buffered': [75, 85, 99],
    'progress.played': [229, 231, 235],
    'overlay.item-header': linear(169, [[0, 0, 0, 0.4], 0], [[55, 56, 56, 1], 80]),
    'overlay.player': linear(180, [[0, 0, 0, 0], 0], [[38, 38, 38, 1], 80]),
    'overlay.mini-player': linear(145, [[38, 38, 38, 0.5], 0], [[38, 38, 38, 0.9], 20], [[38, 38, 38], 60]),
    ...states,
    ...systemBars,
    ...standardPresentation
  }
}

const black = {
  id: 'black',
  labelKey: 'LabelThemeBlack',
  colorScheme: 'dark',
  tokens: {
    'surface.base': [0, 0, 0],
    'surface.content': [0, 0, 0],
    'surface.raised': [0, 0, 0],
    'surface.hover': [0, 0, 0],
    'surface.recessed': [0, 0, 0],
    'text.default': [255, 255, 255],
    'text.primary': [230, 237, 243],
    'text.muted': [120, 126, 132],
    'border.default': [55, 62, 65],
    'control.toggle': [0, 0, 0],
    'control.toggle-selected': [35, 35, 35],
    'progress.track': [107, 114, 128],
    'progress.buffered': [75, 85, 99],
    'progress.played': [229, 231, 235],
    'overlay.item-header': solid([0, 0, 0]),
    'overlay.player': solid([0, 0, 0]),
    'overlay.mini-player': solid([0, 0, 0]),
    ...states,
    ...systemBars,
    ...standardPresentation
  }
}

const light = {
  id: 'light',
  labelKey: 'LabelThemeLight',
  colorScheme: 'light',
  tokens: {
    'surface.base': [222, 222, 222],
    'surface.content': [255, 255, 255],
    'surface.raised': [246, 248, 250],
    'surface.hover': [208, 210, 212],
    'surface.recessed': [222, 222, 222],
    'text.default': [0, 0, 0],
    'text.primary': [37, 37, 37],
    'text.muted': [101, 109, 118],
    'border.default': [189, 191, 191],
    'control.toggle': [222, 222, 222],
    'control.toggle-selected': [255, 255, 255],
    'progress.track': [189, 191, 191],
    'progress.buffered': [129, 131, 131],
    'progress.played': [101, 109, 118],
    'overlay.item-header': linear(169, [[255, 255, 255, 0.4], 0], [[255, 255, 255, 1], 80]),
    'overlay.player': linear(180, [[255, 255, 255, 0], 0], [[255, 255, 255, 1], 80]),
    'overlay.mini-player': linear(145, [[255, 255, 255, 0.5], 0], [[255, 255, 255, 0.9], 20], [[255, 255, 255], 60]),
    ...states,
    ...systemBars,
    ...standardPresentation
  }
}

const DEFAULT_THEME_ID = 'dark'

// Order shown in Settings (unchanged from before: Black, Dark, Light)
const BUILTIN_THEMES = [black, dark, light]

module.exports = { BUILTIN_THEMES, DEFAULT_THEME_ID }
