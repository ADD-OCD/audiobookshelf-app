package app.absplus.android.managers

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import app.absplus.android.player.PlayerNotificationService.PlaylistQueueItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The state a widget/headset Play needs to rebuild playback after the player service (or the whole
 * process) is gone. The store is stateless over SharedPreferences, so reading it back through a fresh
 * call is what a recreated service sees.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PlaybackRestoreStoreTest {
  private lateinit var ctx: Context
  private val twelve = (0 until 12).map { PlaylistQueueItem("local_device_b$it", null) }

  private fun rawPrefs() = ctx.getSharedPreferences("absplus_playback_restore", Context.MODE_PRIVATE)

  @Before
  fun setUp() {
    ctx = ApplicationProvider.getApplicationContext()
    rawPrefs().edit().clear().commit()
  }

  @Test
  fun resumableDefaultsToFalseAndPersists() {
    assertFalse(PlaybackRestoreStore.isResumable(ctx))
    PlaybackRestoreStore.setResumable(ctx, true)
    assertTrue(PlaybackRestoreStore.isResumable(ctx))
    assertTrue(rawPrefs().getBoolean("resumable", false))
    // Player close (X) clears it
    PlaybackRestoreStore.setResumable(ctx, false)
    assertFalse(PlaybackRestoreStore.isResumable(ctx))
  }

  @Test
  fun twelveItemQueueAndIndexRoundTrip() {
    PlaybackRestoreStore.saveQueue(ctx, twelve, 7)
    val loaded = PlaybackRestoreStore.loadQueue(ctx)
    assertEquals(twelve, loaded.items)
    assertEquals(7, loaded.index)
  }

  @Test
  fun podcastEpisodeIdentityAndStreamingEntriesSurvive() {
    val mixed = listOf(PlaylistQueueItem("local_p", "local_e1"), PlaylistQueueItem("server-p", "e2"), PlaylistQueueItem("server-book", null))
    PlaybackRestoreStore.saveQueue(ctx, mixed, 1)
    assertEquals(PlaybackRestoreStore.SavedQueue(mixed, 1), PlaybackRestoreStore.loadQueue(ctx))
  }

  @Test
  fun missingSavedQueueLoadsAsEmpty() {
    assertEquals(PlaybackRestoreStore.SavedQueue(emptyList(), -1), PlaybackRestoreStore.loadQueue(ctx))
  }

  @Test
  fun clearedQueueLoadsAsEmpty() {
    PlaybackRestoreStore.saveQueue(ctx, twelve, 3)
    PlaybackRestoreStore.saveQueue(ctx, emptyList(), -1)
    assertEquals(PlaybackRestoreStore.SavedQueue(emptyList(), -1), PlaybackRestoreStore.loadQueue(ctx))
  }

  @Test
  fun malformedSavedQueueLoadsAsEmptyInsteadOfThrowing() {
    rawPrefs().edit().putString("queue", "{not json").putInt("queueIndex", 2).commit()
    assertEquals(PlaybackRestoreStore.SavedQueue(emptyList(), -1), PlaybackRestoreStore.loadQueue(ctx))
    rawPrefs().edit().putString("queue", """[{"episodeId":null}]""").commit()
    assertEquals(PlaybackRestoreStore.SavedQueue(emptyList(), -1), PlaybackRestoreStore.loadQueue(ctx))
  }

  @Test
  fun queueIsReattachedOnlyWhenItsCurrentEntryIsTheRestoredItem() {
    val saved = PlaybackRestoreStore.SavedQueue(twelve, 7)
    assertSame(saved, PlaybackRestoreStore.queueForRestoredItem(saved, "local_device_b7", null))
    assertNull(PlaybackRestoreStore.queueForRestoredItem(saved, "local_device_b6", null))
    assertNull(PlaybackRestoreStore.queueForRestoredItem(saved, "local_device_b7", "episode"))
    assertNull(PlaybackRestoreStore.queueForRestoredItem(PlaybackRestoreStore.SavedQueue(twelve, -1), "local_device_b0", null))
    assertNull(PlaybackRestoreStore.queueForRestoredItem(PlaybackRestoreStore.SavedQueue(twelve, 12), "local_device_b11", null))
    assertNull(PlaybackRestoreStore.queueForRestoredItem(PlaybackRestoreStore.SavedQueue(emptyList(), -1), "local_device_b0", null))
    val episodes = PlaybackRestoreStore.SavedQueue(listOf(PlaylistQueueItem("local_p", "local_e1")), 0)
    assertSame(episodes, PlaybackRestoreStore.queueForRestoredItem(episodes, "local_p", "local_e1"))
  }

  @Test
  fun restoredQueueSurvivesARecreatedServiceReadingPersistedState() {
    // What restoreLastPlaybackSession/finishRestore do after the process died: read everything back
    PlaybackRestoreStore.setResumable(ctx, true)
    PlaybackRestoreStore.saveQueue(ctx, twelve, 4)
    val recreated = ApplicationProvider.getApplicationContext<Context>()
    assertTrue(PlaybackRestoreStore.isResumable(recreated))
    val saved = PlaybackRestoreStore.loadQueue(recreated)
    assertEquals(12, PlaybackRestoreStore.queueForRestoredItem(saved, "local_device_b4", null)?.items?.size)
  }
}
