package app.absplus.android.managers

import android.content.Context
import android.util.Log
import app.absplus.android.player.PlayerNotificationService.PlaylistQueueItem
import org.json.JSONArray
import org.json.JSONObject

/**
 * Minimal state needed to rebuild playback after the player service/process is gone.
 * The session itself is DeviceData.lastPlaybackSession; position comes from local/server progress.
 */
object PlaybackRestoreStore {
  const val LOG_TAG = "PlaybackRestore"
  private const val PREFS = "absplus_playback_restore"
  private const val KEY_RESUMABLE = "resumable"
  private const val KEY_QUEUE = "queue"
  private const val KEY_QUEUE_INDEX = "queueIndex"

  data class SavedQueue(val items: List<PlaylistQueueItem>, val index: Int)

  private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun isResumable(ctx: Context): Boolean = prefs(ctx).getBoolean(KEY_RESUMABLE, false)

  fun setResumable(ctx: Context, resumable: Boolean) {
    if (isResumable(ctx) == resumable) return
    Log.i(LOG_TAG, "resumable=$resumable")
    prefs(ctx).edit().putBoolean(KEY_RESUMABLE, resumable).apply()
  }

  fun saveQueue(ctx: Context, items: List<PlaylistQueueItem>, index: Int) {
    val arr = JSONArray()
    items.forEach { arr.put(JSONObject().put("libraryItemId", it.libraryItemId).put("episodeId", it.episodeId ?: JSONObject.NULL)) }
    prefs(ctx).edit().putString(KEY_QUEUE, arr.toString()).putInt(KEY_QUEUE_INDEX, index).apply()
  }

  fun loadQueue(ctx: Context): SavedQueue {
    return try {
      val arr = JSONArray(prefs(ctx).getString(KEY_QUEUE, null) ?: "[]")
      val items = (0 until arr.length()).map {
        val o = arr.getJSONObject(it)
        PlaylistQueueItem(o.getString("libraryItemId"), if (o.isNull("episodeId")) null else o.getString("episodeId"))
      }
      SavedQueue(items, prefs(ctx).getInt(KEY_QUEUE_INDEX, -1))
    } catch (e: Exception) {
      Log.e(LOG_TAG, "Failed to read saved queue: $e")
      SavedQueue(emptyList(), -1)
    }
  }
}
