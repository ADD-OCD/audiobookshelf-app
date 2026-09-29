package app.absplus.android.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Bundle
import android.util.SizeF
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class WidgetSizeTest {
  @Test
  fun classifiesByActualSize() {
    assertEquals(WidgetSize.COMPACT, WidgetSize.classify(275f, 50f)) // the existing minimum size
    assertEquals(WidgetSize.COMPACT, WidgetSize.classify(300f, 110f))
    assertEquals(WidgetSize.WIDE, WidgetSize.classify(320f, 60f))
    assertEquals(WidgetSize.WIDE, WidgetSize.classify(700f, 149f))
    assertEquals(WidgetSize.FULL, WidgetSize.classify(250f, 150f))
    assertEquals(WidgetSize.FULL, WidgetSize.classify(400f, 220f))
    assertEquals(WidgetSize.COMPACT, WidgetSize.classify(240f, 400f)) // tall but too narrow for FULL
    assertEquals(WidgetSize.COMPACT, WidgetSize.classify(0f, 0f)) // size not reported yet
  }

  /** Android 12+ best-fit rule: among ideal sizes that fit, the one closest to the widget size wins. */
  private fun platformChoice(width: Float, height: Float): WidgetSize {
    val fitting = WidgetSize.RESPONSIVE_IDEAL_SIZES.filter { (ideal, _) -> ideal.width <= width && ideal.height <= height }
    val pick = fitting.minByOrNull { (ideal, _) -> (ideal.width - width) * (ideal.width - width) + (ideal.height - height) * (ideal.height - height) }
    return pick?.second ?: WidgetSize.RESPONSIVE_IDEAL_SIZES.minByOrNull { (ideal, _) -> ideal.width * ideal.height }!!.second
  }

  @Test
  fun responsiveIdealSizesAgreeWithClassifyAcrossLauncherSizes() {
    var checked = 0
    for (w in 180..900 step 10) {
      for (h in 40..520 step 10) {
        val width = w.toFloat()
        val height = h.toFloat()
        assertEquals("size ${w}x$h", WidgetSize.classify(width, height), platformChoice(width, height))
        checked++
      }
    }
    assertTrue(checked > 3000)
  }

  @Test
  fun responsiveIdealSizesAreDistinctAndWithinPlatformLimit() {
    val keys = WidgetSize.RESPONSIVE_IDEAL_SIZES.map { it.first }
    assertEquals(keys.size, keys.toSet().size)
    assertTrue(keys.size <= 16) // RemoteViews accepts at most 16 sized layouts
    assertTrue(keys.contains(SizeF(1f, 1f)))
  }

  @Test
  fun api24To30SizeComesFromLauncherOptions() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val options =
      Bundle().apply {
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 330)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 90)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 420)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 60)
      }
    assertEquals(WidgetSize.WIDE, WidgetRenderer.sizeFromOptions(context, options)) // portrait: min width x max height
    options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 200)
    assertEquals(WidgetSize.FULL, WidgetRenderer.sizeFromOptions(context, options))
    assertEquals(WidgetSize.COMPACT, WidgetRenderer.sizeFromOptions(context, null))
    assertEquals(WidgetSize.COMPACT, WidgetRenderer.sizeFromOptions(context, Bundle()))
  }
}
