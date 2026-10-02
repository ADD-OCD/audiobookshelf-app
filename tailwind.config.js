const defaultTheme = require('tailwindcss/defaultTheme')
const plugin = require('tailwindcss/plugin')
const themeEngine = require('./theme/engine')
const themePresets = require('./theme/presets')

// Built-in themes are validated data (theme/builtins.js); a broken built-in fails the build
if (themeEngine.BUILTIN_ERRORS.length) {
  throw new Error(`Invalid built-in theme data:\n${themeEngine.BUILTIN_ERRORS.join('\n')}`)
}

module.exports = {
  content: ['components/**/*.vue', 'layouts/**/*.vue', 'pages/**/*.vue', 'mixins/**/*.js', 'plugins/**/*.js'],
  theme: {
    extend: {
      screens: {
        short: { raw: '(max-height: 500px)' }
      },
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        'bg-hover': 'rgb(var(--color-bg-hover) / <alpha-value>)',
        fg: 'rgb(var(--color-fg) / <alpha-value>)',
        'fg-muted': 'rgb(var(--color-fg-muted) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        'bg-toggle': 'rgb(var(--color-bg-toggle) / <alpha-value>)',
        'bg-toggle-selected': 'rgb(var(--color-bg-toggle-selected) / <alpha-value>)',
        'track-cursor': 'rgb(var(--color-track-cursor) / <alpha-value>)',
        track: 'rgb(var(--color-track) / <alpha-value>)',
        'track-buffered': 'rgb(var(--color-track-buffered) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        error: 'rgb(var(--color-error) / <alpha-value>)',
        info: 'rgb(var(--color-info) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        successDark: 'rgb(var(--color-success-dark) / <alpha-value>)',
        'success-action': 'rgb(var(--color-success-action) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)'
      },
      cursor: {
        none: 'none'
      },
      fontFamily: {
        sans: ['Source Sans Pro', ...defaultTheme.fontFamily.sans],
        mono: ['Ubuntu Mono', ...defaultTheme.fontFamily.mono]
      },
      fontSize: {
        '1.5xl': '1.375rem',
        xxs: '0.625rem'
      },
      spacing: {
        18: '4.5rem'
      },
      height: {
        18: '4.5rem'
      },
      maxWidth: {
        24: '6rem'
      },
      minWidth: {
        4: '1rem',
        8: '2rem',
        10: '2.5rem',
        12: '3rem',
        16: '4rem'
      },
      minHeight: {
        12: '3rem'
      }
    }
  },
  plugins: [
    // Emits each built-in theme's token variables (:root = default theme, html[data-theme='<id>'] for others),
    // then the fixed presentation recipe rules for themes whose finish isn't 'standard'
    plugin(({ addBase }) => {
      addBase(themeEngine.builtinThemeRules())
      addBase(themePresets.builtinPresentationRules())
    })
  ]
}
