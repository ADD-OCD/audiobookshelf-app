package app.absplus.android.player

import android.content.Intent
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Phase 3C D1: after process death the system recreates the START_STICKY player service with a null
 * intent and nothing prepared. Only that case stops the service and drops the stale notification.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class StickyRestartTest {
  @Test
  fun nullIntentWithNothingPreparedIsAnEmptyRestart() {
    assertTrue(StickyRestart.isEmptyRestart(null, hasPreparedSession = false, isRestoringPlayback = false))
  }

  @Test
  fun appStartsAlwaysCarryAnIntentAndAreNeverStopped() {
    // preparePlayer starts the service with a plain intent; widget/headset Play with MEDIA_BUTTON
    assertFalse(StickyRestart.isEmptyRestart(Intent(), hasPreparedSession = false, isRestoringPlayback = false))
    assertFalse(StickyRestart.isEmptyRestart(Intent(Intent.ACTION_MEDIA_BUTTON), hasPreparedSession = false, isRestoringPlayback = false))
  }

  @Test
  fun aPreparedOrRestoringSessionIsNeverStopped() {
    assertFalse(StickyRestart.isEmptyRestart(null, hasPreparedSession = true, isRestoringPlayback = false))
    assertFalse(StickyRestart.isEmptyRestart(null, hasPreparedSession = false, isRestoringPlayback = true))
  }
}
