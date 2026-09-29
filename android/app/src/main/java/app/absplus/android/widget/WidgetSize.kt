package app.absplus.android.widget

import android.util.SizeF

/**
 * Presentation buckets for the single, resizable media widget. Buckets come from the widget's actual
 * size in dp (launcher cell sizes vary by device and grid), never from assumed cell counts.
 *
 * - COMPACT: the existing widget (roughly 3x1)
 * - WIDE: one row with extra width (roughly 4x1)
 * - FULL: two or more rows (roughly 4x2)
 */
enum class WidgetSize {
  COMPACT,
  WIDE,
  FULL;

  companion object {
    const val WIDE_MIN_WIDTH_DP = 320f
    const val FULL_MIN_WIDTH_DP = 250f
    const val FULL_MIN_HEIGHT_DP = 150f

    /** The bucket for a widget of the given size (used directly on API 24-30). */
    fun classify(widthDp: Float, heightDp: Float): WidgetSize =
      when {
        heightDp >= FULL_MIN_HEIGHT_DP && widthDp >= FULL_MIN_WIDTH_DP -> FULL
        widthDp >= WIDE_MIN_WIDTH_DP -> WIDE
        else -> COMPACT
      }

    /**
     * Ideal sizes for Android 12+ responsive RemoteViews. The platform shows, among the layouts whose ideal
     * size fits the widget, the one closest to the widget's size. A small grid of ideal sizes per bucket makes
     * that choice agree with [classify] (verified by WidgetSizeTest across a range of sizes).
     */
    val RESPONSIVE_IDEAL_SIZES: List<Pair<SizeF, WidgetSize>> =
      listOf(
        SizeF(1f, 1f) to COMPACT,
        SizeF(WIDE_MIN_WIDTH_DP, 1f) to WIDE,
        SizeF(480f, 1f) to WIDE,
        SizeF(640f, 1f) to WIDE,
        SizeF(800f, 1f) to WIDE,
        SizeF(FULL_MIN_WIDTH_DP, FULL_MIN_HEIGHT_DP) to FULL,
        SizeF(400f, FULL_MIN_HEIGHT_DP) to FULL,
        SizeF(550f, FULL_MIN_HEIGHT_DP) to FULL,
        SizeF(700f, FULL_MIN_HEIGHT_DP) to FULL,
        SizeF(850f, FULL_MIN_HEIGHT_DP) to FULL
      )
  }
}
