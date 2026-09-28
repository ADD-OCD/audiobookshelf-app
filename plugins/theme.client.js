import Vue from 'vue'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import themeEngine from '@/theme/engine'

/**
 * The single place the app applies a theme (see docs/theme-architecture.md).
 *
 * Built-in theme CSS is generated at build time, so applying a theme only sets <html data-theme> to a
 * validated built-in id and applies the system-bar token. Persistence stays on the existing
 * Preferences key `theme` ('dark' | 'black' | 'light'); unknown stored values resolve to the default.
 * A future token provider (e.g. Follow Device/System) would plug in here, not in components.
 */
export class ThemeService {
  constructor({ localStore, root, platform, statusBar }) {
    this.localStore = localStore
    this.root = root
    this.platform = platform
    this.statusBar = statusBar
    this.state = Vue.observable({ id: themeEngine.DEFAULT_THEME_ID })
    this.ready = Promise.resolve()
  }

  get id() {
    return this.state.id
  }

  get theme() {
    return themeEngine.getTheme(this.state.id)
  }

  get themes() {
    return themeEngine.THEMES
  }

  /** Applies a built-in theme without persisting it. Returns the id actually applied. */
  apply(requestedId) {
    const theme = themeEngine.getTheme(requestedId)
    this.root.dataset.theme = theme.id
    this.state.id = theme.id
    this.applySystemBars(theme)
    return theme.id
  }

  applySystemBars(theme) {
    if (this.platform === 'web' || !this.statusBar) return
    // Capacitor's Style.Dark = light icons for a dark bar background
    const style = theme.tokens['system.bar-icons'] === 'dark' ? Style.Light : Style.Dark
    this.statusBar.setStyle({ style }).catch((error) => console.error('[ThemeService] Failed to set status bar style', error))
  }

  /** Applies and persists a user selection. */
  async select(requestedId) {
    const id = this.apply(requestedId)
    await this.localStore.setTheme(id)
    return id
  }

  /** Applies the persisted selection (or the default). */
  async restore() {
    const stored = await this.localStore.getTheme()
    return this.apply(stored)
  }
}

export default ({ app }, inject) => {
  const service = new ThemeService({ localStore: app.$localStore, root: document.documentElement, platform: Capacitor.getPlatform(), statusBar: StatusBar })
  // Default theme immediately (matches the previous unconditional dark status-bar style at startup),
  // then the saved selection once Preferences has answered.
  service.apply(themeEngine.DEFAULT_THEME_ID)
  service.ready = service.restore().catch((error) => console.error('[ThemeService] Failed to restore theme', error))
  inject('theme', service)
}
