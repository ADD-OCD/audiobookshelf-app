package app.absplus.android.widget

import android.appwidget.AppWidgetManager
import android.os.Build
import android.os.Bundle
import android.util.SizeF

/**
 * Responsive presentation and artwork bounds for the FULL widget.
 *
 * FULL has two presentations with the same views and ids:
 * - NORMAL (media_player_widget_full*.xml): cover beside the readout. The readout keeps a protected width, so the
 *   cover stops growing at width - 48dp - that width; further height becomes space around the block.
 * - EXPANDED (media_player_widget_full_expanded*.xml): cover on top, readout below at full width. The cover can
 *   then use nearly the whole widget width, which is what tall widgets need for a large cover.
 *
 * [plan] picks EXPANDED only when it gives a clearly larger cover than NORMAL (at least [EXPANDED_GAIN] times and
 * [EXPANDED_MIN_GAIN_DP] more), assuming a square cover and a two-line title, so normal two-row sizes always stay
 * NORMAL and the choice doesn't change from book to book. The renderer then sets the cover's maxWidth/maxHeight
 * from the plan; the layouts keep the cover at its own aspect (wrap_content + adjustViewBounds + fitCenter) and
 * within the space actually available, so it is never cropped and never overlaps the readout.
 *
 * The dp values below mirror the FULL layouts; where standard and LLAMA differ, reserves that protect the readout
 * use the larger value and the height backstops the smaller one (never tighter than the layout itself).
 * tests/widget-theme.test.mjs fails if the layouts drift.
 */
object FullArtwork {
  /** widgetContent padding, each side. */
  const val CONTENT_PADDING_DP = 8f
  /** widgetReadout marginStart (NORMAL). */
  const val READOUT_MARGIN_DP = 10f
  /** tinyCornerIcon width + marginStart. */
  const val CORNER_ICON_DP = 16f + 6f
  /** widgetReadout padding, each side (standard 6dp, LLAMA 8dp). */
  const val READOUT_PADDING_DP = 8f
  const val READOUT_PADDING_MIN_DP = 6f
  /** widgetProgress marginTop + height (standard 5dp; LLAMA's 6dp is enforced by its own layout). */
  const val PROGRESS_DP = 8f + 5f
  /** widgetButtonContainer marginTop + height. */
  const val CONTROLS_DP = 6f + 52f
  /** EXPANDED: margin between the cover area and the readout row. */
  const val EXPANDED_READOUT_GAP_DP = 8f

  /** Readout text sizes (sp): title, author and the elapsed/remaining times. */
  const val TITLE_TEXT_SP = 16f
  const val TIME_TEXT_SP = 13f
  /** Space between readout lines: author marginTop + time row marginTop. */
  const val READOUT_LINE_GAPS_DP = 2f + 8f
  /** Line heights of the platform font at these sizes, in em (measured: 21.7dp / 40.3dp at 16sp, 17.5dp at 13sp). */
  const val LINE_HEIGHT_EM = 1.35f
  const val TWO_LINE_HEIGHT_EM = 2.52f
  /** The longest common remaining time, "-12:34:56" (books of 10h+), and a monospace glyph's advance in em. */
  const val TIME_CHARS = 9
  const val MONOSPACE_ADVANCE_EM = 0.6f

  /** EXPANDED must beat NORMAL's cover by this factor and by this much. */
  const val EXPANDED_GAIN = 1.2f
  const val EXPANDED_MIN_GAIN_DP = 24f

  /** Never size the cover below this, even on a widget too small to protect everything. */
  const val MIN_ARTWORK_DP = 32f

  /** NORMAL: width beside the cover that is never artwork: padding, readout margin and the corner icon. */
  const val HORIZONTAL_CHROME_DP = 2 * CONTENT_PADDING_DP + READOUT_MARGIN_DP + CORNER_ICON_DP

  /** Height that is never artwork in either presentation: padding, progress bar and controls. */
  const val VERTICAL_CHROME_DP = 2 * CONTENT_PADDING_DP + PROGRESS_DP + CONTROLS_DP

  enum class Presentation {
    NORMAL,
    EXPANDED
  }

  /** Largest box the cover (frame included) may use; it keeps its aspect within it. */
  data class Bounds(val maxWidthDp: Float, val maxHeightDp: Float) {
    val squareDp: Float get() = minOf(maxWidthDp, maxHeightDp)
  }

  data class Plan(val presentation: Presentation, val bounds: Bounds)

  private fun scale(fontScale: Float) = fontScale.coerceAtLeast(1f)

  /**
   * NORMAL: the readout width protected from the artwork. The time row splits it into two equal halves, each of
   * which must fit a 9-character remaining time; title and author ellipsize within the same width.
   */
  fun minReadoutWidthDp(fontScale: Float = 1f): Float = 2 * TIME_CHARS * MONOSPACE_ADVANCE_EM * TIME_TEXT_SP * scale(fontScale) + 2 * READOUT_PADDING_DP

  /** EXPANDED: the readout's height with a one- or two-line title. */
  fun readoutHeightDp(fontScale: Float = 1f, titleLines: Int = 2, paddingDp: Float = READOUT_PADDING_DP): Float {
    val title = TITLE_TEXT_SP * if (titleLines >= 2) TWO_LINE_HEIGHT_EM else LINE_HEIGHT_EM
    return (title + 2 * TIME_TEXT_SP * LINE_HEIGHT_EM) * scale(fontScale) + READOUT_LINE_GAPS_DP + 2 * paddingDp
  }

  /** NORMAL bounds for a widget of the given size, or null when no usable size has been reported yet. */
  fun bounds(widthDp: Float, heightDp: Float, fontScale: Float = 1f): Bounds? {
    if (widthDp <= 0f || heightDp <= 0f) return null
    val maxWidth = widthDp - HORIZONTAL_CHROME_DP - minReadoutWidthDp(fontScale)
    val maxHeight = heightDp - VERTICAL_CHROME_DP
    return Bounds(maxWidth.coerceAtLeast(MIN_ARTWORK_DP), maxHeight.coerceAtLeast(MIN_ARTWORK_DP))
  }

  /**
   * EXPANDED bounds: the full content width, and the height above the readout (backstop with a one-line title;
   * a two-line title is limited by the layout itself).
   */
  fun expandedBounds(widthDp: Float, heightDp: Float, fontScale: Float = 1f): Bounds? {
    if (widthDp <= 0f || heightDp <= 0f) return null
    val maxWidth = widthDp - 2 * CONTENT_PADDING_DP
    val maxHeight = heightDp - VERTICAL_CHROME_DP - EXPANDED_READOUT_GAP_DP - readoutHeightDp(fontScale, titleLines = 1, paddingDp = READOUT_PADDING_MIN_DP)
    return Bounds(maxWidth.coerceAtLeast(MIN_ARTWORK_DP), maxHeight.coerceAtLeast(MIN_ARTWORK_DP))
  }

  /** The square cover EXPANDED guarantees even with a two-line title (used to choose the presentation). */
  fun expandedSquareDp(widthDp: Float, heightDp: Float, fontScale: Float = 1f): Float =
    minOf(widthDp - 2 * CONTENT_PADDING_DP, heightDp - VERTICAL_CHROME_DP - EXPANDED_READOUT_GAP_DP - readoutHeightDp(fontScale, titleLines = 2)).coerceAtLeast(0f)

  /** Presentation and cover bounds for a FULL widget of the given size, or null before a size is reported. */
  fun plan(widthDp: Float, heightDp: Float, fontScale: Float = 1f): Plan? {
    val normal = bounds(widthDp, heightDp, fontScale) ?: return null
    val stacked = expandedSquareDp(widthDp, heightDp, fontScale)
    val side = normal.squareDp
    return if (stacked >= side * EXPANDED_GAIN && stacked >= side + EXPANDED_MIN_GAIN_DP) Plan(Presentation.EXPANDED, expandedBounds(widthDp, heightDp, fontScale)!!) else Plan(Presentation.NORMAL, normal)
  }

  /**
   * The size to plan for, from the launcher's widget options: the narrowest reported width (so the readout
   * stays protected in either orientation) and the tallest reported height (the layout itself still limits
   * the cover to the height actually available). Uses OPTION_APPWIDGET_SIZES on Android 12+ when present.
   */
  fun sizeDp(options: Bundle?): SizeF? {
    if (options == null) return null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      @Suppress("DEPRECATION")
      val sizes = options.getParcelableArrayList<SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)
      if (!sizes.isNullOrEmpty()) return SizeF(sizes.minOf { it.width }, sizes.maxOf { it.height })
    }
    val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
    val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
    return if (width > 0 && height > 0) SizeF(width.toFloat(), height.toFloat()) else null
  }
}
