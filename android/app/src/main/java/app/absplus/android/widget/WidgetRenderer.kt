package app.absplus.android.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.support.v4.media.session.PlaybackStateCompat
import android.view.View
import android.widget.RemoteViews
import androidx.media.session.MediaButtonReceiver
import app.absplus.android.BuildConfig
import app.absplus.android.MainActivity
import app.absplus.android.MediaPlayerWidget
import app.absplus.android.R
import app.absplus.android.data.PlaybackSession
import app.absplus.android.device.DeviceManager
import app.absplus.android.diagnostics.DLog
import app.absplus.android.managers.DbManager
import app.absplus.android.managers.PlaybackRestoreStore
import com.bumptech.glide.Glide
import com.bumptech.glide.request.RequestOptions
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Builds the media widget's RemoteViews for every size bucket and pushes them to the launcher.
 *
 * Rendering only reads state; it never touches the player, playback service or restoration. The widget's
 * actions are unchanged: play/pause, rewind and fast-forward go through the existing media-button path,
 * and tapping the widget opens the app.
 */
object WidgetRenderer {
  private const val TAG = "MediaPlayerWidget"
  private const val ARTWORK_PX = 300

  /** What the widget shows; positions are milliseconds from the start of the item. */
  data class State(
    val session: PlaybackSession?,
    val isPlaying: Boolean,
    val showControls: Boolean,
    val positionMs: Long?,
    val durationMs: Long?
  )

  private val mainHandler = Handler(Looper.getMainLooper())
  private val artworkExecutor = Executors.newSingleThreadExecutor()

  // Main-thread state
  private var lastState: State? = null
  private var artworkKey: String? = null
  private var artworkBitmap: Bitmap? = null
  private var loadingArtworkKey: String? = null
  private var failedArtworkKey: String? = null

  /** A playback event for one placed widget (called on the main thread by the widget updater). */
  fun update(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, state: State) {
    lastState = state
    render(context, appWidgetManager, appWidgetId, state)
  }

  /**
   * Redraws placed widgets from the last known state without touching the player: used for launcher
   * updates, size changes and theme changes. With no state in this process yet (e.g. the process was
   * started by the launcher), falls back to the last saved session shown as not playing, which is accurate
   * because no player can be running in that case.
   */
  fun renderAll(context: Context, appWidgetIds: IntArray? = null) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      mainHandler.post { renderAll(context, appWidgetIds) }
      return
    }
    val appWidgetManager = AppWidgetManager.getInstance(context)
    val ids = appWidgetIds ?: appWidgetManager.getAppWidgetIds(ComponentName(context, MediaPlayerWidget::class.java))
    if (ids.isEmpty()) return
    val state = lastState ?: fallbackState(context)
    for (id in ids) render(context, appWidgetManager, id, state)
  }

  private fun fallbackState(context: Context): State {
    DbManager.initialize(context)
    val session = DeviceManager.deviceData.lastPlaybackSession
    return State(
      session = session,
      isPlaying = false,
      showControls = session != null && PlaybackRestoreStore.isResumable(context),
      positionMs = session?.let { (it.currentTime * 1000).toLong() },
      durationMs = session?.let { (it.duration * 1000).toLong() }
    )
  }

  private fun render(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, state: State) {
    val key = artworkUri(context, state.session).toString()
    val bitmap = if (key == artworkKey) artworkBitmap else null
    val actions = Actions.create(context)
    val views =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        // Android 12+: the launcher picks the layout for the current size, including while resizing
        RemoteViews(WidgetSize.RESPONSIVE_IDEAL_SIZES.associate { (idealSize, size) -> idealSize to build(context, size, state, bitmap, actions) })
      } else {
        // API 24-30: pick the layout from the size the launcher reported (redrawn on onAppWidgetOptionsChanged)
        build(context, sizeFromOptions(context, appWidgetManager.getAppWidgetOptions(appWidgetId)), state, bitmap, actions)
      }
    appWidgetManager.updateAppWidget(appWidgetId, views)
    if (bitmap == null && key != failedArtworkKey) loadArtwork(context, key)
  }

  /** API 24-30 size: portrait uses min width x max height, landscape max width x min height (platform convention). */
  fun sizeFromOptions(context: Context, options: Bundle?): WidgetSize {
    if (options == null) return WidgetSize.COMPACT
    val landscape = context.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
    val width = options.getInt(if (landscape) AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH else AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
    val height = options.getInt(if (landscape) AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
    return WidgetSize.classify(width.toFloat(), height.toFloat())
  }

  private fun layoutFor(size: WidgetSize): Int =
    when (size) {
      WidgetSize.COMPACT -> R.layout.media_player_widget
      WidgetSize.WIDE -> R.layout.media_player_widget_wide
      WidgetSize.FULL -> R.layout.media_player_widget
    }

  private fun build(context: Context, size: WidgetSize, state: State, bitmap: Bitmap?, actions: Actions): RemoteViews {
    val views = RemoteViews(context.packageName, layoutFor(size))
    views.setOnClickPendingIntent(R.id.widgetPlayPauseButton, actions.playPause)
    views.setOnClickPendingIntent(R.id.widgetFastForwardButton, actions.fastForward)
    views.setOnClickPendingIntent(R.id.widgetRewindButton, actions.rewind)
    views.setOnClickPendingIntent(R.id.widgetBackground, actions.open)
    views.setViewVisibility(R.id.widgetButtonContainer, if (state.showControls) View.VISIBLE else View.GONE)

    views.setTextViewText(R.id.widgetArtistText, state.session?.displayAuthor ?: "Unknown")
    views.setTextViewText(R.id.widgetMediaTitle, state.session?.displayTitle ?: "Unknown")

    if (bitmap != null) views.setImageViewBitmap(R.id.widgetAlbumArt, bitmap) else views.setImageViewResource(R.id.widgetAlbumArt, R.drawable.icon)
    val playPauseResource = if (state.isPlaying) androidx.mediarouter.R.drawable.ic_media_pause_dark else androidx.mediarouter.R.drawable.ic_media_play_dark
    views.setImageViewResource(R.id.widgetPlayPauseButton, playPauseResource)
    return views
  }

  private fun artworkUri(context: Context, session: PlaybackSession?): Uri =
    session?.getCoverUri(context) ?: Uri.parse("android.resource://${BuildConfig.APPLICATION_ID}/" + R.drawable.icon)

  // Loads the cover off the main thread (same Glide source as before), then redraws with it. A responsive
  // RemoteViews can't be patched after the fact, so the whole widget is redrawn once the bitmap is ready.
  private fun loadArtwork(context: Context, key: String) {
    if (loadingArtworkKey == key) return
    loadingArtworkKey = key
    val appContext = context.applicationContext
    artworkExecutor.execute {
      val future = Glide.with(appContext).asBitmap().load(Uri.parse(key)).apply(RequestOptions().override(ARTWORK_PX, ARTWORK_PX)).submit()
      val bitmap =
        try {
          future.get(20, TimeUnit.SECONDS)?.let { it.copy(it.config ?: Bitmap.Config.ARGB_8888, false) }
        } catch (e: Exception) {
          DLog.w(TAG, "Widget artwork unavailable: ${e.javaClass.simpleName}")
          null
        }
      mainHandler.post {
        Glide.with(appContext).clear(future)
        if (loadingArtworkKey == key) loadingArtworkKey = null
        if (bitmap != null) {
          artworkKey = key
          artworkBitmap = bitmap
          failedArtworkKey = null
        } else {
          failedArtworkKey = key
        }
        val current = lastState ?: fallbackState(appContext)
        if (artworkUri(appContext, current.session).toString() == key) renderAll(appContext)
      }
    }
  }

  /** The widget's existing actions, shared by every size (unchanged intents and flags). */
  private class Actions(val playPause: PendingIntent, val fastForward: PendingIntent, val rewind: PendingIntent, val open: PendingIntent) {
    companion object {
      fun create(context: Context): Actions {
        val openIntent = Intent(context, MainActivity::class.java)
        openIntent.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
        val open = PendingIntent.getActivity(context, System.currentTimeMillis().toInt(), openIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Actions(
          playPause = MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_PLAY_PAUSE),
          fastForward = MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_FAST_FORWARD),
          rewind = MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_REWIND),
          open = open
        )
      }
    }
  }
}
