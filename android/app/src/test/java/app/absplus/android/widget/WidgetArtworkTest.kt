package app.absplus.android.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.util.DisplayMetrics
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
class WidgetArtworkTest {
  private val ctx: Context = ApplicationProvider.getApplicationContext()

  private fun intrinsicDp(art: Bitmap): Float = BitmapDrawable(ctx.resources, art).intrinsicWidth / ctx.resources.displayMetrics.density

  @Test
  @Config(sdk = [35], qualifiers = "xxhdpi")
  fun coverIntrinsicSizeNoLongerDependsOnScreenDensity() {
    val loaded = Bitmap.createBitmap(300, 300, Bitmap.Config.ARGB_8888).apply { density = DisplayMetrics.DENSITY_XXHIGH }
    val art = WidgetRenderer.widgetArtwork(loaded)
    assertNotSame(loaded, art) // the widget keeps its own copy
    assertEquals(WidgetRenderer.ARTWORK_DENSITY, art.density)
    // The same intrinsic size on every phone, above any FULL bounds (an expanded cover can be the widget's full
    // width), so the bounds (FullArtwork, or the widget_full_artwork_max fallback) decide the displayed size
    assertEquals(WidgetRenderer.ARTWORK_INTRINSIC_DP.toFloat(), intrinsicDp(art), 1f)
  }

  @Test
  @Config(sdk = [35], qualifiers = "xxxhdpi")
  fun coverIntrinsicSizeIsTheSameAtAnotherDensity() {
    val art = WidgetRenderer.widgetArtwork(Bitmap.createBitmap(300, 300, Bitmap.Config.ARGB_8888))
    assertEquals(WidgetRenderer.ARTWORK_INTRINSIC_DP.toFloat(), intrinsicDp(art), 1f)
  }
}
