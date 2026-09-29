/**
 * Theme engine: validation, fallback and the only path from theme data to CSS.
 *
 * Theme data is constrained data, never CSS: colors are integer channels, overlays are structured
 * gradient stops, enums come from fixed lists. CSS text is produced here from those validated
 * numbers/enums and a fixed set of property names (theme/tokens.js), so no theme value can inject
 * CSS, markup, script or URLs. Unknown keys are ignored; invalid or missing values fall back to the
 * default theme's value for that token.
 *
 * CommonJS on purpose: used by tailwind.config.js at build time and by plugins/theme.client.js.
 */
const { TOKENS } = require('./tokens')
const { BUILTIN_THEMES, DEFAULT_THEME_ID } = require('./builtins')

const THEME_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
const LABEL_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/
const COLOR_SCHEMES = ['dark', 'light']
const MAX_GRADIENT_STOPS = 8

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)
const isChannel = (n) => Number.isInteger(n) && n >= 0 && n <= 255
const inRange = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max

function validColor(value, allowAlpha) {
  if (!Array.isArray(value)) return null
  if (value.length === 3 && value.every(isChannel)) return value.slice()
  if (allowAlpha && value.length === 4 && value.slice(0, 3).every(isChannel) && inRange(value[3], 0, 1)) return value.slice()
  return null
}

function validOverlay(value) {
  if (!isPlainObject(value)) return null
  if (value.kind === 'solid') {
    const color = validColor(value.color, false)
    return color ? { kind: 'solid', color } : null
  }
  if (value.kind === 'linear') {
    if (!inRange(value.angle, 0, 360) || !Array.isArray(value.stops)) return null
    if (value.stops.length < 2 || value.stops.length > MAX_GRADIENT_STOPS) return null
    const stops = []
    for (const stop of value.stops) {
      if (!isPlainObject(stop)) return null
      const color = validColor(stop.color, true)
      if (!color || !inRange(stop.at, 0, 100)) return null
      stops.push({ color, at: stop.at })
    }
    return { kind: 'linear', angle: value.angle, stops }
  }
  return null
}

/** Returns a normalized copy of `value` if it is valid for `token`, otherwise null. */
function validateTokenValue(token, value) {
  if (token.type === 'rgb') return validColor(value, false)
  if (token.type === 'overlay') return validOverlay(value)
  if (token.type === 'enum') return typeof value === 'string' && token.values.includes(value) ? value : null
  return null
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

/**
 * Validates a token map against the schema. Only schema tokens are read (own properties only);
 * anything invalid or missing takes the fallback value. Never throws.
 * @returns {{ tokens: object, errors: string[] }}
 */
function validateTokens(input, fallbackTokens) {
  const errors = []
  const source = isPlainObject(input) ? input : {}
  if (!isPlainObject(input)) errors.push('tokens: not a plain object')
  const tokens = {}
  for (const token of TOKENS) {
    const value = own(source, token.name) ? validateTokenValue(token, source[token.name]) : null
    if (value === null) {
      if (own(source, token.name)) errors.push(`${token.name}: invalid value`)
      else errors.push(`${token.name}: missing`)
      tokens[token.name] = fallbackTokens ? fallbackTokens[token.name] : null
    } else {
      tokens[token.name] = value
    }
  }
  const known = new Set(TOKENS.map((t) => t.name))
  Object.keys(source)
    .filter((key) => !known.has(key))
    .forEach((key) => errors.push(`${String(key).slice(0, 64)}: unknown token ignored`))
  return { tokens: deepFreeze(tokens), errors }
}

/**
 * Validates a whole theme definition (identity + tokens). Invalid identity fields make the theme
 * unusable (returns theme: null); token problems fall back per token.
 */
function validateTheme(definition, fallbackTokens) {
  if (!isPlainObject(definition)) return { theme: null, errors: ['theme: not a plain object'] }
  const errors = []
  if (typeof definition.id !== 'string' || !THEME_ID_PATTERN.test(definition.id)) errors.push('id: invalid')
  if (typeof definition.labelKey !== 'string' || !LABEL_KEY_PATTERN.test(definition.labelKey)) errors.push('labelKey: invalid')
  if (!COLOR_SCHEMES.includes(definition.colorScheme)) errors.push('colorScheme: invalid')
  if (errors.length) return { theme: null, errors }
  const { tokens, errors: tokenErrors } = validateTokens(definition.tokens, fallbackTokens)
  return { theme: deepFreeze({ id: definition.id, labelKey: definition.labelKey, colorScheme: definition.colorScheme, tokens }), errors: tokenErrors }
}

// --- Serialization (the only place theme values become CSS text) ---

const rgbChannels = (c) => `${c[0]} ${c[1]} ${c[2]}`
const cssColor = (c) => (c.length === 4 ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})` : `rgb(${c[0]}, ${c[1]}, ${c[2]})`)

function serializeTokenValue(token, value) {
  if (token.type === 'rgb') return rgbChannels(value)
  if (token.type === 'overlay') {
    if (value.kind === 'solid') return cssColor(value.color)
    return `linear-gradient(${value.angle}deg, ${value.stops.map((s) => `${cssColor(s.color)} ${s.at}%`).join(', ')})`
  }
  return null // enums are not CSS
}

/** CSS declarations (property -> value) for a validated token map. */
function themeDeclarations(tokens) {
  const declarations = {}
  for (const token of TOKENS) {
    if (!token.cssVar) continue
    const value = validateTokenValue(token, tokens[token.name])
    if (value === null) continue
    declarations[token.cssVar] = serializeTokenValue(token, value)
  }
  declarations.color = 'rgb(var(--color-text-default))'
  return declarations
}

function themeSelector(themeId) {
  if (!THEME_ID_PATTERN.test(themeId)) throw new Error('Invalid theme id')
  return themeId === DEFAULT_THEME_ID ? ':root' : `html[data-theme='${themeId}']`
}

/** { selector: declarations } for every built-in theme, for the Tailwind base layer. */
function builtinThemeRules() {
  const rules = {}
  for (const theme of THEMES) rules[themeSelector(theme.id)] = themeDeclarations(theme.tokens)
  return rules
}

/** Plain CSS text for rules produced by this module (tests / future runtime use). */
function toCssText(rules) {
  return Object.entries(rules)
    .map(
      ([selector, declarations]) =>
        `${selector} { ${Object.entries(declarations)
          .map(([p, v]) => `${p}: ${v};`)
          .join(' ')} }`
    )
    .join('\n')
}

// --- Built-in registry ---

const DEFAULT_DEFINITION = BUILTIN_THEMES.find((t) => t.id === DEFAULT_THEME_ID)
const BUILTIN_ERRORS = []
const defaultResult = validateTheme(DEFAULT_DEFINITION, null)
defaultResult.errors.forEach((e) => BUILTIN_ERRORS.push(`${DEFAULT_THEME_ID}: ${e}`))
const DEFAULT_TOKENS = defaultResult.theme ? defaultResult.theme.tokens : null

const THEMES = Object.freeze(
  BUILTIN_THEMES.map((definition) => {
    const { theme, errors } = validateTheme(definition, DEFAULT_TOKENS)
    errors.forEach((e) => BUILTIN_ERRORS.push(`${definition.id}: ${e}`))
    return theme
  }).filter(Boolean)
)

/** Maps any stored/requested value to a built-in theme id; unknown values resolve to the default. */
function resolveThemeId(value) {
  if (typeof value !== 'string') return DEFAULT_THEME_ID
  const theme = THEMES.find((t) => t.id === value)
  return theme ? theme.id : DEFAULT_THEME_ID
}

/**
 * The non-EPUB reader shell only knows 'black', 'dark' and 'light' (components/readers/Reader.vue).
 * Those themes keep their own shell; any other theme uses the shell matching its color scheme.
 */
const READER_SHELLS = ['black', 'dark', 'light']
function readerShellId(theme) {
  if (!theme) return DEFAULT_THEME_ID
  if (READER_SHELLS.includes(theme.id)) return theme.id
  return theme.colorScheme === 'light' ? 'light' : 'dark'
}

function getTheme(id) {
  return THEMES.find((t) => t.id === resolveThemeId(id))
}

module.exports = {
  THEMES,
  DEFAULT_THEME_ID,
  BUILTIN_ERRORS,
  validateTokens,
  validateTheme,
  themeDeclarations,
  themeSelector,
  builtinThemeRules,
  toCssText,
  resolveThemeId,
  readerShellId,
  getTheme
}
