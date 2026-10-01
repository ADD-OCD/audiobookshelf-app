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

  @Test
  fun fullPresentationsOnlyChangeFullAndKeepTheTheme() {
    assertEquals(R.layout.media_player_widget_full_expanded, WidgetRenderer.layoutFor(WidgetSize.FULL, WidgetTheme.STANDARD, FullArtwork.Presentation.EXPANDED))
    assertEquals(R.layout.media_player_widget_full_expanded_llama, WidgetRenderer.layoutFor(WidgetSize.FULL, WidgetTheme.LLAMA, FullArtwork.Presentation.EXPANDED))
    assertEquals(R.layout.media_player_widget_full_expanded_large, WidgetRenderer.layoutFor(WidgetSize.FULL, WidgetTheme.STANDARD, FullArtwork.Presentation.LARGE))
    assertEquals(R.layout.media_player_widget_full_expanded_large_llama, WidgetRenderer.layoutFor(WidgetSize.FULL, WidgetTheme.LLAMA, FullArtwork.Presentation.LARGE))
    for (theme in WidgetTheme.values()) {
      for (size in listOf(WidgetSize.COMPACT, WidgetSize.WIDE)) {
        for (full in FullArtwork.Presentation.values()) assertEquals("$size $theme $full", WidgetRenderer.layoutFor(size, theme), WidgetRenderer.layoutFor(size, theme, full))
      }
    }
  }
}
