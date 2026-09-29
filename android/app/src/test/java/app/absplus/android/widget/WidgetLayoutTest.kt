package app.absplus.android.widget

import app.absplus.android.R
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// View-id parity between the standard and LLAMA layouts is checked from the XML in tests/widget-theme.test.mjs
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class WidgetLayoutTest {
  @Test
  fun standardThemesKeepTheExistingLayouts() {
    assertEquals(R.layout.media_player_widget, WidgetRenderer.layoutFor(WidgetSize.COMPACT, WidgetTheme.STANDARD))
    assertEquals(R.layout.media_player_widget_wide, WidgetRenderer.layoutFor(WidgetSize.WIDE, WidgetTheme.STANDARD))
    assertEquals(R.layout.media_player_widget_full, WidgetRenderer.layoutFor(WidgetSize.FULL, WidgetTheme.STANDARD))
  }

  @Test
  fun llamaHasItsOwnVariantForEverySize() {
    assertEquals(R.layout.media_player_widget_llama, WidgetRenderer.layoutFor(WidgetSize.COMPACT, WidgetTheme.LLAMA))
    assertEquals(R.layout.media_player_widget_wide_llama, WidgetRenderer.layoutFor(WidgetSize.WIDE, WidgetTheme.LLAMA))
    assertEquals(R.layout.media_player_widget_full_llama, WidgetRenderer.layoutFor(WidgetSize.FULL, WidgetTheme.LLAMA))
  }
}
