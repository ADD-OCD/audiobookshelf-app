package app.absplus.android.widget

import android.appwidget.AppWidgetManager
import android.os.Build
import android.os.Bundle
import android.util.SizeF

/**
 * Responsive artwork bounds for the FULL widget.
 *
 * The FULL layouts size the cover as wrap_content with adjustViewBounds + fitCenter, so the layout already
 * keeps it within the height left above the progress bar and controls, at the cover's own aspect. What the
 * layout can't express is "leave the readout enough width", which is how very tall widgets used to grow the
 * cover across the readout until title/author/times disappeared. The renderer therefore sets the cover's
 * maxWidth/maxHeight from the widget's reported size: the cover grows with the widget until the protected
 * readout width (or the available height) stops it, and any further height becomes space around it.
 *
 * The dp values below mirror media_player_widget_full.xml / media_player_widget_full_llama.xml; where they
 * differ, the width reserve uses the larger value (the readout is never squeezed) and the height backstop the
 * smaller one (never tighter than the layout itself). tests/widget-theme.test.mjs fails if the layouts drift.
 */
object FullArtwork {
  /** widgetContent padding, each side. */
  const val CONTENT_PADDING_DP = 8f
  /** widgetReadout marginStart. */
  const val READOUT_MARGIN_DP = 10f
  /** tinyCornerIcon width + marginStart. */
  const val CORNER_ICON_DP = 16f + 6f
  /** widgetReadout padding, each side (standard 6dp, LLAMA 8dp). */
  const val READOUT_PADDING_DP = 8f
  /** widgetProgress marginTop + height (standard 5dp; LLAMA's 6dp is enforced by its own layout). */
  const val PROGRESS_DP = 8f + 5f
  /** widgetButtonContainer marginTop + height. */
  const val CONTROLS_DP = 6f + 52f

  /** Elapsed/remaining text size (sp) and the longest common remaining time, "-12:34:56" (books of 10h+). */
  const val TIME_TEXT_SP = 13f
  const val TIME_CHARS = 9
  /** Advance of a monospace glyph, in em. */
  const val MONOSPACE_ADVANCE_EM = 0.6f

  /** Never size the cover below this, even on a widget too small to protect everything. */
  const val MIN_ARTWORK_DP = 32f

  /** Width beside the cover that is never artwork: padding, readout margin and the corner icon. */
  const val HORIZONTAL_CHROME_DP = 2 * CONTENT_PADDING_DP + READOUT_MARGIN_DP + CORNER_ICON_DP

  /** Height that is never artwork: padding, progress bar and controls (a backstop; the layout limits height too). */
  const val VERTICAL_CHROME_DP = 2 * CONTENT_PADDING_DP + PROGRESS_DP + CONTROLS_DP

  /**
   * The readout width that is protected from the artwork: the time row splits it into two equal halves, each
   * of which must fit a 9-character remaining time; title and author ellipsize within the same width. The text
   * part follows the user's font size.
   */
  fun minReadoutWidthDp(fontScale: Float = 1f): Float = 2 * TIME_CHARS * MONOSPACE_ADVANCE_EM * TIME_TEXT_SP * fontScale.coerceAtLeast(1f) + 2 * READOUT_PADDING_DP

  /** Largest box the cover (frame included) may use; it keeps its aspect within it. */
  data class Bounds(val maxWidthDp: Float, val maxHeightDp: Float)

  /** Bounds for a FULL widget of the given size, or null when no usable size has been reported yet. */
  fun bounds(widthDp: Float, heightDp: Float, fontScale: Float = 1f): Bounds? {
    if (widthDp <= 0f || heightDp <= 0f) return null
    val maxWidth = widthDp - HORIZONTAL_CHROME_DP - minReadoutWidthDp(fontScale)
    val maxHeight = heightDp - VERTICAL_CHROME_DP
    return Bounds(maxWidth.coerceAtLeast(MIN_ARTWORK_DP), maxHeight.coerceAtLeast(MIN_ARTWORK_DP))
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
