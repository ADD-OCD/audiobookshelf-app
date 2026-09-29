/**
 * Presentation projection for the `presentation.cover-color` policy.
 *
 * The player and item page sample the cover's average color (utils/coverAverageColor.js, unchanged).
 * This decides what the *chrome* uses:
 * - 'legacy': exactly the previous behavior. Chrome is tinted with the sampled cover color, and the
 *   foreground switches to dark on light covers (except in the Black theme, as before).
 * - 'theme': chrome uses the theme's own surfaces. The values are fixed references to token variables
 *   owned by this repository, never theme-supplied strings. Cover art itself is unaffected.
 *
 * CommonJS so node tests can load it; the app imports it as a module.
 */

// Fixed references to token variables (theme/tokens.js): surface.base and surface.raised
const THEME_BACKDROP = 'rgb(var(--color-primary))'
const THEME_CONTROL = 'rgb(var(--color-secondary))'

/**
 * @param {{ id: string, colorScheme: string, tokens: object }} theme a validated theme (engine.getTheme)
 * @param {{ rgb: string|null, isLight: boolean }} cover the sampled cover color, unchanged
 * @returns {{ usesTheme: boolean, backdrop: string|null, control: string|null, isLight: boolean, darkForeground: boolean }}
 */
function coverColorPresentation(theme, cover) {
  if (theme && theme.tokens && theme.tokens['presentation.cover-color'] === 'theme') {
    const isLight = theme.colorScheme === 'light'
    return { usesTheme: true, backdrop: THEME_BACKDROP, control: THEME_CONTROL, isLight, darkForeground: isLight }
  }
  const rgb = cover && cover.rgb ? cover.rgb : null
  const isLight = !!(cover && cover.isLight)
  return { usesTheme: false, backdrop: rgb, control: rgb, isLight, darkForeground: isLight && (!theme || theme.id !== 'black') }
}

module.exports = { coverColorPresentation, THEME_BACKDROP, THEME_CONTROL }
