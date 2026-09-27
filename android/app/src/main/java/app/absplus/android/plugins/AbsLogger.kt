package app.absplus.android.plugins

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.util.Log
import androidx.core.content.FileProvider
import app.absplus.android.BuildConfig
import app.absplus.android.MainActivity
import app.absplus.android.device.DeviceManager
import app.absplus.android.diagnostics.DiagnosticLog
import app.absplus.android.diagnostics.DiagnosticSanitizer
import app.absplus.android.managers.PlaybackRestoreStore
import com.fasterxml.jackson.core.json.JsonReadFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors

data class AbsLog(
  var id:String,
  var tag:String,
  var level:String,
  var message:String,
  var timestamp:Long
)

data class AbsLogList(val value:List<AbsLog>)

@CapacitorPlugin(name = "AbsLogger")
class AbsLogger : Plugin() {
  private var jacksonMapper = jacksonObjectMapper().enable(JsonReadFeature.ALLOW_UNESCAPED_CONTROL_CHARS.mappedFeature())
  private val ioExecutor = Executors.newSingleThreadExecutor()

  override fun load() {
    DiagnosticLog.init(context)
    onLogEmitter = { log:AbsLog ->
      notifyListeners("onLog", JSObject(jacksonMapper.writeValueAsString(log)))
    }
    info("AbsLogger", "load: AbsLogger plugin initialized")
  }

  companion object {
    var onLogEmitter:((log:AbsLog) -> Unit)? = null

    // App-log entries are persisted at every diagnostic level (the pre-existing app log behaviour)
    fun log(level:String, tag:String, message:String) {
      DiagnosticLog.write(if (level == "error") 'E' else 'I', tag.ifEmpty { "AbsLogger" }, message, DiagnosticLog.Persist.ALWAYS)
      val absLog = AbsLog(id = UUID.randomUUID().toString(), tag, level, message, timestamp = System.currentTimeMillis())
      onLogEmitter?.let { it(absLog) }
    }
    fun info(tag:String, message:String) {
      Log.i("AbsLogger", message)
      log("info", tag, message)
    }
    fun error(tag:String, message:String) {
      Log.e("AbsLogger", message)
      log("error", tag, message)
    }
  }

  @PluginMethod
  fun info(call: PluginCall) {
    val msg = call.getString("message") ?: return call.reject("No message")
    val tag = call.getString("tag") ?: ""
    info(tag, msg)
    call.resolve()
  }

  @PluginMethod
  fun error(call: PluginCall) {
    val msg = call.getString("message") ?: return call.reject("No message")
    val tag = call.getString("tag") ?: ""
    error(tag, msg)
    call.resolve()
  }

  /** Batched JS diagnostics: entries = [{ level: debug|verbose|info|warn|error, tag, message, timestamp }] */
  @PluginMethod
  fun logBatch(call: PluginCall) {
    val entries = call.getArray("entries")
    if (entries != null) {
      for (i in 0 until entries.length()) {
        val e = entries.optJSONObject(i) ?: continue
        val (levelChar, persist) = when (e.optString("level")) {
          "verbose" -> 'V' to DiagnosticLog.Persist.VERBOSE
          "warn" -> 'W' to DiagnosticLog.Persist.DEBUG
          "error" -> 'E' to DiagnosticLog.Persist.DEBUG
          "info" -> 'I' to DiagnosticLog.Persist.DEBUG
          else -> 'D' to DiagnosticLog.Persist.DEBUG
        }
        DiagnosticLog.write(levelChar, e.optString("tag", "js"), e.optString("message"), persist, "JS", e.optLong("timestamp", System.currentTimeMillis()))
      }
    }
    call.resolve()
  }

  @PluginMethod
  fun getDiagnosticLevel(call: PluginCall) {
    val ret = JSObject()
    ret.put("level", DiagnosticLog.level.name)
    call.resolve(ret)
  }

  @PluginMethod
  fun setDiagnosticLevel(call: PluginCall) {
    val level = try { DiagnosticLog.Level.valueOf(call.getString("level") ?: "") } catch (e: Exception) { return call.reject("Invalid level") }
    DiagnosticLog.setLevel(level)
    getDiagnosticLevel(call)
  }

  @PluginMethod
  fun addDiagnosticMarker(call: PluginCall) {
    val note = call.getString("note")?.trim().orEmpty()
    DiagnosticLog.marker(if (note.isEmpty()) "USER MARKER" else "USER MARKER: $note", DiagnosticLog.Persist.ALWAYS)
    call.resolve()
  }

  /** Tail of the diagnostic log for the in-app viewer (bounded, read off the main thread). */
  @PluginMethod
  fun readDiagnosticLog(call: PluginCall) {
    val maxBytes = (call.getInt("maxBytes") ?: 256 * 1024).coerceIn(4 * 1024, 2 * 1024 * 1024)
    ioExecutor.execute {
      try {
        DiagnosticLog.flushNow()
        val (text, total) = DiagnosticLog.readTail(maxBytes)
        val ret = JSObject()
        ret.put("text", text)
        ret.put("totalBytes", total)
        ret.put("truncated", total > maxBytes)
        ret.put("level", DiagnosticLog.level.name)
        call.resolve(ret)
      } catch (e: Exception) {
        call.reject("Failed to read diagnostic log: ${e.message}")
      }
    }
  }

  @PluginMethod
  fun getDiagnosticInfo(call: PluginCall) {
    ioExecutor.execute {
      val ret = JSObject()
      ret.put("level", DiagnosticLog.level.name)
      ret.put("totalBytes", DiagnosticLog.totalBytes())
      ret.put("maxBytes", DiagnosticLog.MAX_FILE_BYTES * DiagnosticLog.MAX_FILES)
      call.resolve(ret)
    }
  }

  @PluginMethod
  fun shareDiagnosticLog(call: PluginCall) {
    // Header reads player state, which must happen on the main thread
    activity.runOnUiThread { exportAndShare(call, buildDiagnosticHeader()) }
  }

  private fun exportAndShare(call: PluginCall, header: String) {
    ioExecutor.execute {
      try {
        val dir = File(context.cacheDir, "diagnostics-export").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        val file = File(dir, "absplus-diagnostics-${BuildConfig.VERSION_NAME}-$stamp.txt")
        DiagnosticLog.exportTo(file, header)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
          type = "text/plain"
          putExtra(Intent.EXTRA_STREAM, uri)
          putExtra(Intent.EXTRA_SUBJECT, "Audiobookshelf+ diagnostic log")
          clipData = ClipData.newRawUri(file.name, uri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.runOnUiThread {
          try {
            activity.startActivity(Intent.createChooser(send, "Share diagnostic log").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            val ret = JSObject()
            ret.put("filename", file.name)
            ret.put("bytes", file.length())
            call.resolve(ret)
          } catch (e: Exception) {
            call.reject("Failed to open share sheet: ${e.message}")
          }
        }
      } catch (e: Exception) {
        call.reject("Failed to export diagnostic log: ${e.message}")
      }
    }
  }

  @PluginMethod
  fun clearDiagnosticLog(call: PluginCall) {
    ioExecutor.execute {
      DiagnosticLog.clear()
      File(context.cacheDir, "diagnostics-export").listFiles()?.forEach { it.delete() }
      call.resolve()
    }
  }

  // Kept for compatibility with older callers: recent entries parsed from the diagnostic log
  @PluginMethod
  fun getAllLogs(call: PluginCall) {
    ioExecutor.execute {
      val logs = DiagnosticLog.readTail(256 * 1024).first.lineSequence().filter { it.isNotBlank() }.map {
        AbsLog(UUID.randomUUID().toString(), "", "info", it, System.currentTimeMillis())
      }.toList()
      call.resolve(JSObject(jacksonMapper.writeValueAsString(AbsLogList(logs))))
    }
  }

  @PluginMethod
  fun clearLogs(call: PluginCall) = clearDiagnosticLog(call)

  private fun buildDiagnosticHeader(): String {
    val sb = StringBuilder()
    sb.appendLine("===== Audiobookshelf+ diagnostic log =====")
    sb.appendLine("Exported: ${DiagnosticLog.formatTimestamp(System.currentTimeMillis())}")
    sb.appendLine("App: ${BuildConfig.VERSION_NAME} (versionCode ${BuildConfig.VERSION_CODE}), package ${BuildConfig.APPLICATION_ID}, ${BuildConfig.BUILD_TYPE}")
    sb.appendLine("Device: ${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})")
    sb.appendLine("Diagnostic level: ${DiagnosticLog.level}")
    sb.appendLine("Log storage: ${DiagnosticLog.totalBytes() / 1024} KB of max ${DiagnosticLog.MAX_FILE_BYTES * DiagnosticLog.MAX_FILES / 1024 / 1024} MB")
    try {
      val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val caps = cm.getNetworkCapabilities(cm.activeNetwork)
      val transport = when {
        caps == null -> "none"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
        else -> "other"
      }
      sb.appendLine("Network: $transport, metered=${cm.isActiveNetworkMetered}, validated=${caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true}")
    } catch (e: Exception) {
      sb.appendLine("Network: unavailable ($e)")
    }
    val config = DeviceManager.serverConnectionConfig
    sb.appendLine("Server connected: ${config != null}${config?.let { ", server ${it.address}, server version ${it.version}" } ?: ""}")
    sb.appendLine("Saved server connections: ${DeviceManager.deviceData.serverConnectionConfigs.size}")
    val last = DeviceManager.deviceData.lastPlaybackSession
    sb.appendLine("Resumable session saved: ${PlaybackRestoreStore.isResumable(context)}${last?.let { " (${if (it.isLocal) "downloaded" else "streamed"}, item ${it.mediaItemId})" } ?: ""}")
    try {
      val mainActivity = activity as? MainActivity
      if (mainActivity != null && mainActivity.isPlayerNotificationServiceInitialized()) {
        val pns = mainActivity.foregroundService
        val session = pns.currentPlaybackSession
        if (session == null) {
          sb.appendLine("Playback: no session prepared")
        } else {
          val kind = if (session.isLocal) "downloaded/local" else if (session.isHLS) "streamed (HLS transcode)" else "streamed (direct play)"
          sb.appendLine("Playback: \"${session.displayTitle}\" item ${session.mediaItemId}, $kind, player ${pns.getMediaPlayer()}")
          sb.appendLine("Playback state: playing=${pns.currentPlayer.isPlaying}, playWhenReady=${pns.currentPlayer.playWhenReady}, playerState=${pns.currentPlayer.playbackState}, position=${"%.1f".format(Locale.US, pns.getCurrentTimeSeconds())}s of ${"%.1f".format(Locale.US, session.getTotalDuration())}s, rate=${pns.currentPlayer.playbackParameters.speed}")
        }
        sb.appendLine("Queue: ${pns.playlistQueue.size} items, index ${pns.playlistQueueIndex}")
      } else {
        sb.appendLine("Playback: player service not bound")
      }
    } catch (e: Exception) {
      sb.appendLine("Playback: unavailable ($e)")
    }
    sb.appendLine("Timestamps: device local time with UTC offset. Format: time level source/tag (pid): message  (N = native, JS = app UI)")
    sb.appendLine("==========================================")
    sb.appendLine()
    return DiagnosticSanitizer.sanitize(sb.toString())
  }
}
