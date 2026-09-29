package app.absplus.android.widget

import android.content.Context

/**
 * Which repository-owned widget presentation to use. Only the saved built-in theme id is read (the same
 * Capacitor Preferences value the app's $theme service persists); it is matched against a fixed allow-list
 * and never used as a color, drawable name, resource id, path or style. Unknown, custom, missing or
 * unreadable values fall back to the standard widget look.
 */
enum class WidgetTheme {
  /** The existing widget look, used for Dark, Black and Light. */
  STANDARD,

  /** LLAMA equipment look (resources generated from theme/builtins.js). */
  LLAMA;

  companion object {
    private const val PREFS = "CapacitorStorage"
    private const val KEY_THEME = "theme"

    /** Fixed allow-list: built-in theme ids that have their own native widget presentation. */
    fun fromThemeId(themeId: String?): WidgetTheme =
      when (themeId) {
        "llama" -> LLAMA
        else -> STANDARD
      }

    fun current(context: Context): WidgetTheme {
      val saved = runCatching { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_THEME, null) }.getOrNull()
      return fromThemeId(saved)
    }
  }
}
