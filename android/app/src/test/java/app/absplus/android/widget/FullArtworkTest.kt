package app.absplus.android.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Bundle
import android.util.SizeF
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.RemoteViews
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class FullArtworkTest {
  private val minReadout = FullArtwork.minReadoutWidthDp()

  /** Side of a square cover inside the bounds (the layout keeps the aspect within them). */
  private fun square(widthDp: Float, heightDp: Float, fontScale: Float = 1f): Float = FullArtwork.bounds(widthDp, heightDp, fontScale)!!.let { minOf(it.maxWidthDp, it.maxHeightDp) }

  private fun readout(widthDp: Float, fontScale: Float = 1f): Float = widthDp - FullArtwork.HORIZONTAL_CHROME_DP - FullArtwork.bounds(widthDp, 1000f, fontScale)!!.maxWidthDp

  @Test
  fun normalFullIsNotSmallerThanThePhase2cResult() {
    // Emulator normal two-row FULL (360x224dp) showed a 136.8dp cover with the 140dp cap
    assertTrue(square(360f, 224f) >= 136.8f)
    // Wherever the width leaves the protected readout beside a 140dp cover, two-row sizes match min(140, height)
    for (w in 345..900 step 5) {
      for (h in 150..240 step 2) {
        val phase2c = minOf(140f, h - FullArtwork.VERTICAL_CHROME_DP)
        assertTrue("${w}x$h", square(w.toFloat(), h.toFloat()) >= phase2c)
      }
    }
  }

  @Test
  fun tallerFullWidgetsGetLargerArtwork() {
    assertTrue(square(360f, 344f) > 140f)
    assertTrue(square(420f, 464f) > 200f)
    assertTrue(square(520f, 900f) > 300f)
  }

  @Test
  fun growthIsMonotonicInHeightAndWidth() {
    for (w in 250..900 step 10) {
      var previous = 0f
      for (h in 150..2400 step 10) {
        val side = square(w.toFloat(), h.toFloat())
        assertTrue("${w}x$h grows with height", side >= previous)
        previous = side
      }
    }
    for (h in 150..2400 step 50) {
      var previous = 0f
      for (w in 250..900 step 10) {
        val side = square(w.toFloat(), h.toFloat())
        assertTrue("${w}x$h grows with width", side >= previous)
        previous = side
      }
    }
  }

  @Test
  fun readoutKeepsItsProtectedWidthAtEveryFullSize() {
    // FULL starts at 250dp wide; tall + narrow is where the readout is protected and the cover stops growing
    for (w in 250..900 step 5) {
      assertEquals("${w}dp", minReadout, readout(w.toFloat()), 0.01f)
    }
    // The time row's two halves each fit "-12:34:56" (13sp monospace) inside the readout padding
    assertTrue(minReadout >= 2 * 9 * 0.6f * 13f + 2 * 8f)
  }

  @Test
  fun boundsNeverExceedTheSafeRectangle() {
    for (w in 250..900 step 10) {
      for (h in 150..2400 step 25) {
        val b = FullArtwork.bounds(w.toFloat(), h.toFloat())!!
        assertTrue("${w}x$h width", b.maxWidthDp <= w - FullArtwork.HORIZONTAL_CHROME_DP - minReadout + 0.01f)
        assertTrue("${w}x$h height", b.maxHeightDp <= maxOf(h - FullArtwork.VERTICAL_CHROME_DP, FullArtwork.MIN_ARTWORK_DP))
      }
    }
  }

  @Test
  fun extremeHeightCannotCollapseTheReadout() {
    for (w in listOf(250f, 275f, 291f, 360f, 412f)) {
      for (h in listOf(1000f, 3000f, 10000f)) {
        val b = FullArtwork.bounds(w, h)!!
        assertTrue("${w}x$h", w - FullArtwork.HORIZONTAL_CHROME_DP - b.maxWidthDp >= minReadout - 0.01f)
        assertTrue("${w}x$h stops growing with height", b.maxWidthDp < h)
      }
    }
  }

  @Test
  fun largerFontsProtectAWiderReadout() {
    assertTrue(FullArtwork.minReadoutWidthDp(1.3f) > minReadout)
    assertTrue(readout(360f, 1.3f) > readout(360f))
    assertEquals(minReadout, FullArtwork.minReadoutWidthDp(0.85f), 0.01f) // never less than at default size
    assertEquals(FullArtwork.MIN_ARTWORK_DP, FullArtwork.bounds(250f, 400f, 3f)!!.maxWidthDp, 0.01f)
  }

  @Test
  fun noReportedSizeKeepsTheLayoutFallback() {
    assertNull(FullArtwork.bounds(0f, 0f))
    assertNull(FullArtwork.sizeDp(null))
    assertNull(FullArtwork.sizeDp(Bundle()))
  }

  @Test
  fun plansForTheNarrowestWidthAndTallestHeightReported() {
    val sizes = arrayListOf(SizeF(360f, 400f), SizeF(700f, 180f)) // portrait and landscape
    assertEquals(SizeF(360f, 400f), FullArtwork.sizeDp(Bundle().apply { putParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES, sizes) }))
    val minMax =
      Bundle().apply {
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 300)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 600)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 150)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 350)
      }
    assertEquals(SizeF(300f, 350f), FullArtwork.sizeDp(minMax))
  }

  @Test
  @Config(sdk = [24, 26, 28, 30, 31, 33, 35])
  fun maxWidthAndHeightCanBeSetThroughRemoteViews() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val views = RemoteViews(context.packageName, android.R.layout.activity_list_item)
    WidgetRenderer.applyArtworkBounds(views, android.R.id.icon, 123, 456)
    val image = views.apply(context, FrameLayout(context)).findViewById<ImageView>(android.R.id.icon)
    assertEquals(123, image.maxWidth)
    assertEquals(456, image.maxHeight)
    assertEquals(View.VISIBLE, image.visibility) // shown in the end
  }

  /** A launcher reapplies an update to views it has already laid out at the new size; new bounds must relayout. */
  @Test
  @Config(sdk = [24, 26, 28, 30, 31, 33, 35])
  fun newBoundsRelayOutViewsTheLauncherAlreadyHas() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val host = FrameLayout(context)
    val first = RemoteViews(context.packageName, android.R.layout.activity_list_item)
    WidgetRenderer.applyArtworkBounds(first, android.R.id.icon, 100, 100)
    val root = first.apply(context, host)
    host.addView(root)
    fun layOut() {
      host.measure(View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY))
      host.layout(0, 0, 1000, 1000)
    }
    layOut()
    val image = root.findViewById<ImageView>(android.R.id.icon)
    assertFalse(image.isLayoutRequested)
    // Max width/height alone don't request a layout (why the bounds helper exists)
    RemoteViews(context.packageName, android.R.layout.activity_list_item).apply { setInt(android.R.id.icon, "setMaxWidth", 300) }.reapply(context, root)
    assertFalse(image.isLayoutRequested)
    // The helper's update does, and leaves the new bounds in place
    RemoteViews(context.packageName, android.R.layout.activity_list_item).also { WidgetRenderer.applyArtworkBounds(it, android.R.id.icon, 400, 500) }.reapply(context, root)
    assertTrue(image.isLayoutRequested)
    assertEquals(400, image.maxWidth)
    assertEquals(500, image.maxHeight)
    assertEquals(View.VISIBLE, image.visibility)
  }
}
