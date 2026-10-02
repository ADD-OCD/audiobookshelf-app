package app.absplus.android.device

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import app.absplus.android.data.DeviceData
import app.absplus.android.data.DeviceInfo
import app.absplus.android.data.DeviceSettings
import app.absplus.android.data.MediaTypeMetadata
import app.absplus.android.data.PlaybackSession
import app.absplus.android.managers.DbManager
import app.absplus.android.managers.PlaybackRestoreStore
import app.absplus.android.widget.WidgetRenderer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Phase 3C D2: the widget's last-known position. Playback updates the persisted last session's
 * position; the widget's fallback state (what a restarted process draws) shows it, as not playing.
 * Only the position changes: the restore identity and the resumable flag are untouched.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LastPlaybackPositionTest {
  private lateinit var ctx: Context

  private fun session(id: String, currentTime: Double) = PlaybackSession(
    id, "user", "server-item", null, "book", MediaTypeMetadata("Book", false), DeviceInfo("d", "m", "x", 35, "0"),
    emptyList(), "Book", "Author", null, 360.0, 0, 0L, 0L, 0L, mutableListOf(), currentTime, null, null, null, "config-1", null, null
  )

  // WidgetRenderer is frozen (Gate F), so its private fallback state is read reflectively
  private fun fallbackState(): WidgetRenderer.State =
    WidgetRenderer::class.java.getDeclaredMethod("fallbackState", Context::class.java).apply { isAccessible = true }.invoke(WidgetRenderer, ctx) as WidgetRenderer.State

  @Before
  fun setUp() {
    ctx = ApplicationProvider.getApplicationContext()
    DbManager.initialize(ctx)
    ctx.getSharedPreferences("absplus_playback_restore", Context.MODE_PRIVATE).edit().clear().commit()
    DeviceManager.deviceData = DeviceData(mutableListOf(), null, DeviceSettings.default(), session("session-a", 15.0))
    DeviceManager.dbManager.saveDeviceData(DeviceManager.deviceData)
  }

  @Test
  fun latestPositionIsPersistedForTheSameSession() {
    assertTrue(DeviceManager.updateLastPlaybackPosition("session-a", 70.6))
    // What a restarted process reads back from disk
    val persisted = DbManager().getDeviceData().lastPlaybackSession!!
    assertEquals(70.6, persisted.currentTime, 0.0)
    assertEquals("session-a", persisted.id)
    assertEquals("server-item", persisted.libraryItemId)
    assertEquals("config-1", persisted.serverConnectionConfigId)
  }

  @Test
  fun aDifferentSessionNeverOverwritesTheLastOne() {
    assertFalse(DeviceManager.updateLastPlaybackPosition("session-b", 200.0))
    assertEquals(15.0, DbManager().getDeviceData().lastPlaybackSession!!.currentTime, 0.0)
  }

  @Test
  fun widgetFallbackShowsTheLatestPositionAsNotPlayingWithControlsWhenResumable() {
    PlaybackRestoreStore.setResumable(ctx, true)
    DeviceManager.updateLastPlaybackPosition("session-a", 70.6)
    val state = fallbackState()
    assertEquals(70_600L, state.positionMs)
    assertEquals(360_000L, state.durationMs)
    assertFalse(state.isPlaying)
    assertTrue(state.showControls)
    // Updating the display position does not change resumability
    assertTrue(PlaybackRestoreStore.isResumable(ctx))
  }

  @Test
  fun aClosedSessionStaysWithoutControls() {
    PlaybackRestoreStore.setResumable(ctx, false)
    DeviceManager.updateLastPlaybackPosition("session-a", 70.6)
    val state = fallbackState()
    assertEquals(70_600L, state.positionMs)
    assertFalse(state.showControls)
    assertFalse(PlaybackRestoreStore.isResumable(ctx))
  }
}
