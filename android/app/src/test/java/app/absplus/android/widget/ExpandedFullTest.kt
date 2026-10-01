package app.absplus.android.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.util.DisplayMetrics
import android.view.View.MeasureSpec
import android.widget.ImageView
import androidx.test.core.app.ApplicationProvider
import app.absplus.android.widget.FullArtwork.Presentation.EXPANDED
import app.absplus.android.widget.FullArtwork.Presentation.LARGE
import app.absplus.android.widget.FullArtwork.Presentation.NORMAL
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ExpandedFullTest {
  private fun plan(w: Number, h: Number) = FullArtwork.plan(w.toFloat(), h.toFloat())!!

  @Test
  fun normalTwoRowFullStaysSideBySide() {
    for (w in 250..900 step 5) for (h in 150..260 step 2) assertEquals("${w}x$h", NORMAL, plan(w, h).presentation)
    // and keeps exactly the side-by-side bounds it had before
    assertEquals(FullArtwork.bounds(360f, 224f), plan(360, 224).bounds)
  }

  @Test
  fun tallFullExpands() {
    assertEquals(NORMAL, plan(360, 344).presentation) // 3 rows: side-by-side still gives the larger cover
    assertEquals(EXPANDED, plan(360, 464).presentation)
    assertEquals(EXPANDED, plan(360, 584).presentation)
    assertEquals(344f, plan(360, 584).bounds.maxWidthDp, 0.01f) // the full content width
  }

  @Test
  fun wideAndTallFullExpandsToAVeryLargeCover() {
    assertEquals(NORMAL, plan(496, 510).presentation) // side-by-side already gives ~292dp
    assertEquals(EXPANDED, plan(496, 686).presentation)
    assertEquals(LARGE, plan(496, 861).presentation) // stacked, and tall enough for the larger readout/controls
    assertTrue(plan(496, 861).bounds.squareDp >= 450f)
  }

  @Test
  fun tallNarrowFullExpandsSoTheReadoutGetsTheFullWidth() {
    assertEquals(NORMAL, plan(291, 268).presentation)
    assertEquals(EXPANDED, plan(291, 458).presentation)
    assertTrue(plan(291, 458).bounds.squareDp > 2 * FullArtwork.bounds(291f, 458f)!!.squareDp)
  }

  @Test
  fun boundaryIsGeometricAndHasMargin() {
    // At 360dp wide the switch happens where the stacked cover is 1.2x the side-by-side one (~383dp tall)
    assertEquals(NORMAL, plan(360, 383).presentation)
    assertEquals(EXPANDED, plan(360, 384).presentation)
    for (w in 250..900 step 5) {
      for (h in 150..2400 step 5) {
        val p = plan(w, h)
        if (p.presentation != NORMAL) {
          val side = FullArtwork.bounds(w.toFloat(), h.toFloat())!!.squareDp
          val stacked = FullArtwork.expandedSquareDp(w.toFloat(), h.toFloat())
          assertTrue("${w}x$h gain", stacked >= side * FullArtwork.EXPANDED_GAIN && stacked >= side + FullArtwork.EXPANDED_MIN_GAIN_DP)
        }
      }
    }
  }

  @Test
  fun onceExpandedTallerSizesStayExpanded() {
    for (w in 250..900 step 5) {
      var expanded = false
      for (h in 150..3000 step 5) {
        val now = plan(w, h).presentation != NORMAL
        assertTrue("${w}x$h flips back", !expanded || now)
        expanded = now
      }
    }
  }

  @Test
  fun expandedBoundsLeaveRoomForReadoutProgressAndControls() {
    for (w in 250..900 step 10) {
      for (h in 266..2400 step 10) {
        val p = plan(w, h)
        if (p.presentation != EXPANDED) continue
        assertTrue("${w}x$h width", p.bounds.maxWidthDp <= w - 2 * FullArtwork.CONTENT_PADDING_DP)
        // The guaranteed cover plus a two-line readout, gap, progress and controls fits the widget height
        val stacked = FullArtwork.expandedSquareDp(w.toFloat(), h.toFloat())
        assertTrue("${w}x$h height", stacked + FullArtwork.EXPANDED_READOUT_GAP_DP + FullArtwork.readoutHeightDp() + FullArtwork.VERTICAL_CHROME_DP <= h + 0.01f)
        // The backstop leaves at least a one-line readout below the cover
        assertTrue("${w}x$h backstop", p.bounds.maxHeightDp + FullArtwork.EXPANDED_READOUT_GAP_DP + FullArtwork.readoutHeightDp(titleLines = 1, paddingDp = FullArtwork.READOUT_PADDING_MIN_DP) + FullArtwork.VERTICAL_CHROME_DP <= h + 0.01f)
      }
    }
  }

  @Test
  fun largerFontsReserveMoreReadoutHeight() {
    assertTrue(FullArtwork.readoutHeightDp(1.3f) > FullArtwork.readoutHeightDp(1f))
    assertTrue(FullArtwork.expandedSquareDp(360f, 450f, 1.3f) < FullArtwork.expandedSquareDp(360f, 450f, 1f))
  }

  /** A real ImageView configured like the FULL layouts' artwork, measured within the plan's bounds. */
  private fun measuredArtwork(coverWidthPx: Int, coverHeightPx: Int, bounds: FullArtwork.Bounds, framePaddingDp: Int): Pair<Int, Int> {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val density = context.resources.displayMetrics.density
    val cover = WidgetRenderer.widgetArtwork(Bitmap.createBitmap(coverWidthPx, coverHeightPx, Bitmap.Config.ARGB_8888).apply { this.density = DisplayMetrics.DENSITY_XXHIGH })
    val view = ImageView(context)
    view.adjustViewBounds = true
    view.scaleType = ImageView.ScaleType.FIT_CENTER
    val pad = (framePaddingDp * density).toInt()
    view.setPadding(pad, pad, pad, pad)
    view.maxWidth = (bounds.maxWidthDp * density).toInt()
    view.maxHeight = (bounds.maxHeightDp * density).toInt()
    view.setImageDrawable(BitmapDrawable(context.resources, cover))
    // The flexible area is at least as large as the bounds here; the bounds decide the size
    view.measure(MeasureSpec.makeMeasureSpec(4000, MeasureSpec.AT_MOST), MeasureSpec.makeMeasureSpec(4000, MeasureSpec.AT_MOST))
    return Pair(view.measuredWidth - 2 * pad, view.measuredHeight - 2 * pad)
  }

  @Test
  fun coversKeepTheirAspectInsideTheBoundsAndTheFrameHugsThem() {
    val bounds = plan(360, 584).bounds
    for (frame in listOf(0, 2)) { // standard, LLAMA's 2dp frame
      val (sw, sh) = measuredArtwork(300, 300, bounds, frame)
      assertEquals("square, frame $frame", 1.0, sw.toDouble() / sh, 0.02)
      val (pw, ph) = measuredArtwork(300, 450, bounds, frame)
      assertEquals("portrait, frame $frame", 1.5, ph.toDouble() / pw, 0.02)
      val density = ApplicationProvider.getApplicationContext<Context>().resources.displayMetrics.density
      for ((w, h) in listOf(sw to sh, pw to ph)) {
        assertTrue("within bounds, frame $frame", (w + 2 * frame * density) <= bounds.maxWidthDp * density + 1 && (h + 2 * frame * density) <= bounds.maxHeightDp * density + 1)
      }
      assertTrue("portrait stays portrait and fills the height", ph > pw && ph + 2 * frame * density >= bounds.maxHeightDp * density - 2)
    }
  }

  @Test
  fun ordinaryAndShorterStackedSizesKeepTheirSizing() {
    for (w in 250..900 step 5) for (h in 150..260 step 2) assertEquals("${w}x$h", NORMAL, plan(w, h).presentation)
    assertEquals(NORMAL, plan(360, 344).presentation)
    assertEquals(EXPANDED, plan(360, 464).presentation)
    assertEquals(EXPANDED, plan(360, 584).presentation) // the cover nearly fills the space: no room for LARGE
    assertEquals(EXPANDED, plan(291, 458).presentation)
    assertEquals(EXPANDED, plan(496, 686).presentation)
  }

  @Test
  fun veryTallFullGetsTheLargeReadoutAndControls() {
    assertEquals(LARGE, plan(360, 620).presentation) // e.g. the tallest S26 resize (~360x620dp)
    assertEquals(LARGE, plan(496, 861).presentation)
    assertEquals(LARGE, plan(291, 700).presentation)
  }

  @Test
  fun largeBoundaryIsWherePlentyOfHeightIsLeftAboveAFullWidthCover() {
    // LARGE when height >= width + 226.6dp: its readout/controls (2-line title) plus 8dp fit above a full-width cover
    assertEquals(EXPANDED, plan(360, 586).presentation)
    assertEquals(LARGE, plan(360, 587).presentation)
    assertEquals(EXPANDED, plan(496, 722).presentation)
    assertEquals(LARGE, plan(496, 723).presentation)
    for (w in 250..900 step 5) {
      var large = false
      for (h in 150..3000 step 5) {
        val p = plan(w, h)
        if (p.presentation == LARGE) {
          // LARGE never costs the cover anything: still the full content width with a two-line title
          assertTrue("${w}x$h", FullArtwork.largeSpareDp(w.toFloat(), h.toFloat()) >= FullArtwork.LARGE_MARGIN_DP)
          assertEquals("${w}x$h", w - 2 * FullArtwork.CONTENT_PADDING_DP, p.bounds.maxWidthDp, 0.01f)
          assertTrue("${w}x$h", p.bounds.maxHeightDp >= p.bounds.maxWidthDp)
        }
        assertTrue("${w}x$h leaves LARGE", !large || p.presentation == LARGE)
        large = p.presentation == LARGE
      }
    }
  }

  @Test
  fun largeBoundsLeaveRoomForTheLargerReadoutProgressAndControls() {
    for (w in 250..900 step 10) {
      for (h in 400..3000 step 10) {
        val p = plan(w, h)
        if (p.presentation != LARGE) continue
        val readout2 = FullArtwork.readoutHeightDp(titleLines = 2, large = true)
        assertTrue("${w}x$h", (w - 2 * FullArtwork.CONTENT_PADDING_DP) + FullArtwork.EXPANDED_READOUT_GAP_DP + readout2 + FullArtwork.LARGE_VERTICAL_CHROME_DP <= h)
        val readout1 = FullArtwork.readoutHeightDp(titleLines = 1, paddingDp = FullArtwork.READOUT_PADDING_MIN_DP, large = true)
        assertTrue("${w}x$h backstop", p.bounds.maxHeightDp + FullArtwork.EXPANDED_READOUT_GAP_DP + readout1 + FullArtwork.LARGE_VERTICAL_CHROME_DP <= h + 0.01f)
      }
    }
  }

  @Test
  fun largerFontsNeedMoreHeightForLarge() {
    assertEquals(LARGE, plan(360, 590).presentation)
    assertEquals(EXPANDED, FullArtwork.plan(360f, 590f, 1.3f)!!.presentation)
  }
}
