package app.absplus.android.widget

import app.absplus.android.widget.FullArtwork.IconSlot.CORNER
import app.absplus.android.widget.FullArtwork.IconSlot.HIDDEN
import app.absplus.android.widget.FullArtwork.IconSlot.PANEL
import app.absplus.android.widget.FullArtwork.Presentation.EXPANDED
import app.absplus.android.widget.FullArtwork.Presentation.LARGE
import app.absplus.android.widget.FullArtwork.Presentation.NORMAL
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The FULL brand icon floats; these check where it shows and that it never changes the layout plan. */
class WidgetIconTest {
  private fun plan(w: Number, h: Number) = FullArtwork.plan(w.toFloat(), h.toFloat())!!

  @Test
  fun normalUsesThePanelSlotAtTwoRowsAndTheCornerWhenThereIsSpaceAboveTheRow() {
    assertEquals(NORMAL, plan(360, 224).presentation)
    assertEquals(PANEL, plan(360, 224).icon) // the panel has room above a two-line title
    assertEquals(CORNER, plan(360, 344).icon) // spare height above the cover/readout row
    assertEquals(CORNER, plan(291, 268).icon)
    assertEquals(HIDDEN, plan(291, 174).icon) // narrow two-row: no clear spot (the readout fills its panel)
  }

  @Test
  fun expandedShowsTheCornerIconOnlyWhereItClearsTheCover() {
    assertEquals(CORNER, plan(360, 464).icon) // cover narrower than the content: room beside it
    assertEquals(CORNER, plan(360, 584).icon) // spare height above the cover
    var hidden = 0
    for (h in 384..586) {
      val p = plan(360, h)
      assertEquals(EXPANDED, p.presentation)
      if (p.icon == HIDDEN) hidden++ else assertTrue("360x$h", FullArtwork.cornerClearsCover(360f, p.bounds))
    }
    assertTrue("only a band of sizes has no clear spot ($hidden)", hidden in 1..60)
    assertEquals(HIDDEN, plan(360, 510).icon)
  }

  @Test
  fun largeAlwaysShowsTheCornerIconClearOfTheCover() {
    for (w in 250..900 step 5) {
      for (h in 400..3000 step 10) {
        val p = plan(w, h)
        if (p.presentation != LARGE) continue
        assertEquals("${w}x$h", CORNER, p.icon)
        assertTrue("${w}x$h", FullArtwork.cornerClearsCover(w.toFloat(), p.bounds))
      }
    }
  }

  @Test
  fun theIconNeverChangesThePlanItself() {
    for (w in 250..900 step 10) {
      for (h in 150..2400 step 10) {
        val p = plan(w, h)
        val expected =
          when (p.presentation) {
            NORMAL -> FullArtwork.bounds(w.toFloat(), h.toFloat())
            EXPANDED -> FullArtwork.expandedBounds(w.toFloat(), h.toFloat())
            LARGE -> FullArtwork.largeBounds(w.toFloat(), h.toFloat())
          }
        assertEquals("${w}x$h", expected, p.bounds)
      }
    }
    // the former icon width stays in the NORMAL reserve, so cover bounds and the NORMAL/EXPANDED switch don't move
    assertEquals(22f, FullArtwork.CORNER_ICON_DP, 0.01f)
    assertEquals(48f, FullArtwork.HORIZONTAL_CHROME_DP, 0.01f)
  }

  @Test
  fun cornerClearanceArithmetic() {
    assertEquals(18f, FullArtwork.FLOATING_ICON_REACH_DP, 0.01f)
    // a full-width cover starting 8dp below the content top touches the icon; 20dp below clears it
    assertEquals(false, FullArtwork.cornerClearsCover(360f, FullArtwork.Bounds(344f, 344f)))
    assertEquals(true, FullArtwork.cornerClearsCover(360f, FullArtwork.Bounds(344f, 364f)))
    // a narrow cover leaves room beside it
    assertEquals(true, FullArtwork.cornerClearsCover(360f, FullArtwork.Bounds(344f, 300f)))
  }
}
