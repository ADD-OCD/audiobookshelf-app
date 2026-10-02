package app.absplus.android.player

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import app.absplus.android.data.DeviceData
import app.absplus.android.data.DeviceInfo
import app.absplus.android.data.DeviceSettings
import app.absplus.android.data.MediaTypeMetadata
import app.absplus.android.data.PlaybackSession
import app.absplus.android.device.DeviceManager
import app.absplus.android.device.WidgetEventEmitter
import app.absplus.android.managers.DbManager
import com.google.android.exoplayer2.Player
import java.lang.reflect.Proxy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Phase 3C live widget position: the position the progress syncer samples while playing is the one the
 * widget shows (no second sample, no timer). A paused sample is not redrawn; a confirmed seek is shown
 * but not persisted.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LiveWidgetPositionTest {
  private lateinit var pns: PlayerNotificationService
  private var playing = true
  private val shown = mutableListOf<Long>()

  private fun session(id: String, currentTime: Double) = PlaybackSession(
    id, "user", "server-item", null, "book", MediaTypeMetadata("Book", false), DeviceInfo("d", "m", "x", 35, "0"),
    emptyList(), "Book", "Author", null, 360.0, 0, 0L, 0L, 0L, mutableListOf(), currentTime, null, null, null, "config-1", null, null
  )

  // Only isPlaying is read on these paths
  private fun player(): Player = Proxy.newProxyInstance(Player::class.java.classLoader, arrayOf(Player::class.java)) { _, method, _ ->
    if (method.name == "isPlaying") playing else throw UnsupportedOperationException(method.name)
  } as Player

  private fun persistedTime() = DbManager().getDeviceData().lastPlaybackSession!!.currentTime

  @Before
  fun setUp() {
    DbManager.initialize(ApplicationProvider.getApplicationContext<Context>())
    val live = session("session-a", 15.0)
    // As preparePlayer leaves it: the live session is also the persisted last session
    DeviceManager.deviceData = DeviceData(mutableListOf(), null, DeviceSettings.default(), live)
    DeviceManager.dbManager.saveDeviceData(DeviceManager.deviceData)
    pns = PlayerNotificationService()
    pns.currentPlaybackSession = live
    pns.currentPlayer = player()
    DeviceManager.widgetUpdater = object : WidgetEventEmitter {
      override fun onPlayerChanged(pns: PlayerNotificationService) = Unit
      override fun onPlaybackPosition(pns: PlayerNotificationService, positionMs: Long) { shown.add(positionMs) }
      override fun onPlayerClosed() = Unit
    }
  }

  @After
  fun tearDown() {
    DeviceManager.widgetUpdater = null
  }

  @Test
  fun aSampleWhilePlayingReachesTheWidgetAndPersistenceUnchanged() {
    pns.rememberPlaybackPosition("session-a", 70.6)
    assertEquals(listOf(70_600L), shown)
    assertEquals(70.6, persistedTime(), 0.0)
    assertEquals(70.6, pns.currentPlaybackSession!!.currentTime, 0.0)
  }

  @Test
  fun aSampleForAnotherSessionIsIgnored() {
    pns.rememberPlaybackPosition("session-b", 200.0)
    assertEquals(emptyList<Long>(), shown)
    assertEquals(15.0, persistedTime(), 0.0)
  }

  @Test
  fun aPausedSampleIsPersistedButNotRedrawn() {
    playing = false
    pns.rememberPlaybackPosition("session-a", 80.0)
    assertEquals(emptyList<Long>(), shown)
    assertEquals(80.0, persistedTime(), 0.0)
  }

  @Test
  fun aConfirmedSeekIsShownEvenWhilePausedButNotPersisted() {
    playing = false
    pns.showWidgetPosition("session-a", 30.0)
    assertEquals(listOf(30_000L), shown)
    assertEquals(15.0, persistedTime(), 0.0)
    pns.showWidgetPosition("session-b", 40.0)
    pns.showWidgetPosition("session-a", null)
    assertEquals(listOf(30_000L), shown)
  }
}
