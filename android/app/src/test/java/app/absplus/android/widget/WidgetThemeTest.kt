package app.absplus.android.widget

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class WidgetThemeTest {
  private lateinit var ctx: Context

  private fun saveTheme(value: String?) {
    val prefs = ctx.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).edit()
    if (value == null) prefs.remove("theme") else prefs.putString("theme", value)
    prefs.commit()
  }

  @Before
  fun setUp() {
    ctx = ApplicationProvider.getApplicationContext()
    saveTheme(null)
  }

  @Test
  fun standardThemesKeepTheExistingWidgetLook() {
    for (id in listOf("dark", "black", "light")) {
      saveTheme(id)
      assertEquals(id, WidgetTheme.STANDARD, WidgetTheme.current(ctx))
    }
  }

  @Test
  fun llamaUsesItsOwnWidgetPresentation() {
    saveTheme("llama")
    assertEquals(WidgetTheme.LLAMA, WidgetTheme.current(ctx))
  }

  @Test
  fun missingUnknownOrHostileValuesFallBackToStandard() {
    assertEquals(WidgetTheme.STANDARD, WidgetTheme.current(ctx)) // nothing saved
    for (value in listOf("", "LLAMA", "llama ", "llama2", "custom", "@drawable/widget_llama_chassis", "#FF0000", "0x7f080001", "../../etc/passwd", "llama;", "{\"id\":\"llama\"}")) {
      saveTheme(value)
      assertEquals(value, WidgetTheme.STANDARD, WidgetTheme.current(ctx))
    }
  }

  @Test
  fun wrongPreferenceTypeFallsBackInsteadOfCrashing() {
    ctx.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).edit().putInt("theme", 7).commit()
    assertEquals(WidgetTheme.STANDARD, WidgetTheme.current(ctx))
  }
}
