package app.absplus.android.diagnostics

import android.content.Context
import android.os.Process
import android.util.Log
import io.paperdb.Paper
import java.io.BufferedWriter
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStreamWriter
import java.io.RandomAccessFile
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.atomic.AtomicInteger

/**
 * Persistent, size-capped, rolling diagnostic log shared by native code and the JS layer.
 *
 * - Callers only enqueue; one background thread formats, sanitizes and writes, so logging never does
 *   file I/O on the main/player thread.
 * - Files live in private storage (files/diagnostics): absplus-diag.log plus up to 7 rotated files of
 *   ~2 MB each (~16 MB total). Rotation happens on the writer thread only.
 * - Level (NORMAL/DEBUG/VERBOSE) is kept in native SharedPreferences so the playback service can log
 *   correctly with no UI running.
 */
object DiagnosticLog {
  enum class Level { NORMAL, DEBUG, VERBOSE }

  /** Minimum diagnostic level at which an entry is persisted. ALWAYS = persisted at every level. */
  enum class Persist { ALWAYS, DEBUG, VERBOSE }

  const val MAX_FILE_BYTES = 2L * 1024 * 1024
  const val MAX_FILES = 8
  private const val DIR = "diagnostics"
  private const val CURRENT = "absplus-diag.log"
  private const val PREFS = "absplus_diagnostics"
  private const val KEY_LEVEL = "level"
  private const val KEY_LEGACY_MIGRATED = "legacyMigrated"
  private const val QUEUE_CAPACITY = 20000
  private const val MAX_MESSAGE_CHARS = 8000

  private class Entry(val timestamp: Long, val levelChar: Char, val source: String, val tag: String, val message: String, val pid: Int)

  private val queue = LinkedBlockingQueue<Entry>(QUEUE_CAPACITY)
  private val dropped = AtomicInteger(0)
  private val fileLock = Any()
  private var appContext: Context? = null
  private var writer: BufferedWriter? = null
  private var writerThread: Thread? = null

  @Volatile var level: Level = Level.NORMAL
    private set

  private val dateFormat = ThreadLocal.withInitial { SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSSXXX", Locale.US) }

  fun formatTimestamp(ms: Long): String = dateFormat.get()!!.format(Date(ms))

  /** Safe to call repeatedly from any process entry point (Activity, service, widget receiver). */
  @Synchronized
  fun init(context: Context) {
    if (appContext != null) return
    val ctx = context.applicationContext
    appContext = ctx
    level = try {
      Level.valueOf(prefs(ctx).getString(KEY_LEVEL, Level.NORMAL.name) ?: Level.NORMAL.name)
    } catch (e: Exception) {
      Level.NORMAL
    }
    installCrashHandler()
    writerThread = Thread({ writerLoop() }, "DiagnosticLogWriter").apply {
      isDaemon = true
      priority = Thread.MIN_PRIORITY
      start()
    }
    marker("Application process started (pid ${Process.myPid()}, diagnostic level $level)", Persist.DEBUG)
  }

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun setLevel(newLevel: Level) {
    val ctx = appContext ?: return
    prefs(ctx).edit().putString(KEY_LEVEL, newLevel.name).apply()
    val old = level
    level = newLevel
    if (old != newLevel) marker("Diagnostic logging level changed from $old to $newLevel", Persist.ALWAYS)
  }

  fun isPersisted(persist: Persist): Boolean = when (persist) {
    Persist.ALWAYS -> true
    Persist.DEBUG -> level != Level.NORMAL
    Persist.VERBOSE -> level == Level.VERBOSE
  }

  fun write(levelChar: Char, tag: String, message: String, persist: Persist, source: String = "N", timestamp: Long = System.currentTimeMillis()) {
    if (appContext == null || !isPersisted(persist)) return
    val msg = if (message.length > MAX_MESSAGE_CHARS) message.substring(0, MAX_MESSAGE_CHARS) + "…[truncated]" else message
    if (!queue.offer(Entry(timestamp, levelChar, source, tag, msg, Process.myPid()))) dropped.incrementAndGet()
  }

  fun marker(text: String, persist: Persist = Persist.DEBUG) {
    write('I', "Diagnostics", "--- $text ---", persist)
  }

  private fun formatLine(e: Entry): String {
    val body = DiagnosticSanitizer.sanitize(e.message).replace("\r", "").replace("\n", "\n    ")
    return "${formatTimestamp(e.timestamp)} ${e.levelChar} ${e.source}/${DiagnosticSanitizer.sanitize(e.tag)} (${e.pid}): $body\n"
  }

  private fun logDir(): File? = appContext?.let { File(it.filesDir, DIR).apply { mkdirs() } }

  private fun rotatedFile(dir: File, index: Int) = File(dir, "$CURRENT.$index")

  /** Oldest first. */
  fun logFiles(): List<File> {
    val dir = logDir() ?: return emptyList()
    val files = mutableListOf<File>()
    for (i in MAX_FILES - 1 downTo 1) rotatedFile(dir, i).takeIf { it.exists() }?.let { files.add(it) }
    File(dir, CURRENT).takeIf { it.exists() }?.let { files.add(it) }
    return files
  }

  fun totalBytes(): Long = synchronized(fileLock) { logFiles().sumOf { it.length() } }

  // Approximate size of the current file (chars written), so rotation needs no per-line stat()
  private var currentBytes = 0L

  private fun openWriter(): BufferedWriter? {
    val dir = logDir() ?: return null
    val file = File(dir, CURRENT)
    currentBytes = file.length()
    return BufferedWriter(OutputStreamWriter(FileOutputStream(file, true), Charsets.UTF_8))
  }

  private fun rotate() {
    val dir = logDir() ?: return
    val current = File(dir, CURRENT)
    writer?.flush()
    writer?.close()
    writer = null
    rotatedFile(dir, MAX_FILES - 1).delete()
    for (i in MAX_FILES - 2 downTo 1) {
      val f = rotatedFile(dir, i)
      if (f.exists()) f.renameTo(rotatedFile(dir, i + 1))
    }
    current.renameTo(rotatedFile(dir, 1))
  }

  private fun writerLoop() {
    migrateLegacyLogs()
    val batch = ArrayList<Entry>(512)
    while (true) {
      try {
        batch.add(queue.take())
        queue.drainTo(batch, 511)
        synchronized(fileLock) { writeBatchLocked(batch) }
      } catch (e: InterruptedException) {
        return
      } catch (e: Exception) {
        Log.e("DiagnosticLog", "Failed writing diagnostics: $e")
        writer = null
      } finally {
        batch.clear()
      }
    }
  }

  private fun writeLineLocked(line: String) {
    if (writer == null) writer = openWriter()
    val w = writer ?: return
    w.write(line)
    currentBytes += line.length
    if (currentBytes >= MAX_FILE_BYTES) rotate()
  }

  private fun writeBatchLocked(batch: List<Entry>) {
    val droppedCount = dropped.getAndSet(0)
    if (droppedCount > 0) writeLineLocked(formatLine(Entry(System.currentTimeMillis(), 'W', "N", "Diagnostics", "$droppedCount log entries dropped (logging faster than storage)", Process.myPid())))
    for (e in batch) writeLineLocked(formatLine(e))
    writer?.flush()
  }

  /** Writes everything queued so far on the calling thread (used for crashes and before export). */
  fun flushNow() {
    val batch = ArrayList<Entry>()
    queue.drainTo(batch)
    synchronized(fileLock) {
      if (batch.isNotEmpty()) writeBatchLocked(batch)
      writer?.flush()
    }
  }

  private fun installCrashHandler() {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        write('E', "Crash", "FATAL uncaught exception on thread ${thread.name}: ${Log.getStackTraceString(throwable)}", Persist.ALWAYS)
        flushNow()
      } catch (_: Throwable) {}
      previous?.uncaughtException(thread, throwable)
    }
  }

  /** Last [maxBytes] of the combined log (oldest->newest), starting at a line boundary. */
  fun readTail(maxBytes: Int): Pair<String, Long> = synchronized(fileLock) {
    writer?.flush()
    val files = logFiles()
    val total = files.sumOf { it.length() }
    val chunks = ArrayDeque<ByteArray>()
    var remaining = maxBytes.toLong()
    for (f in files.asReversed()) {
      if (remaining <= 0) break
      val len = f.length()
      val take = minOf(len, remaining)
      RandomAccessFile(f, "r").use { raf ->
        raf.seek(len - take)
        val buf = ByteArray(take.toInt())
        raf.readFully(buf)
        chunks.addFirst(buf)
      }
      remaining -= take
    }
    var text = chunks.joinToString("") { String(it, Charsets.UTF_8) }
    if (total > maxBytes) text = text.substringAfter('\n', text)
    Pair(text, total)
  }

  /** Copies the whole log (oldest->newest) after [header] into [dest]. */
  fun exportTo(dest: File, header: String) {
    flushNow()
    synchronized(fileLock) {
      FileOutputStream(dest).use { out ->
        out.write(header.toByteArray(Charsets.UTF_8))
        for (f in logFiles()) f.inputStream().use { it.copyTo(out) }
      }
    }
  }

  /** Deletes only the diagnostic log files. */
  fun clear() {
    queue.clear()
    synchronized(fileLock) {
      writer?.close()
      writer = null
      currentBytes = 0L
      logDir()?.listFiles()?.filter { it.name.startsWith(CURRENT) }?.forEach { it.delete() }
    }
    marker("Diagnostic logs cleared (level $level)", Persist.ALWAYS)
  }

  // One-time import of logs from the old per-entry Paper store, then that store is removed
  private fun migrateLegacyLogs() {
    val ctx = appContext ?: return
    if (prefs(ctx).getBoolean(KEY_LEGACY_MIGRATED, false)) return
    try {
      val book = Paper.book("log")
      val legacy = book.allKeys.mapNotNull { key ->
        try { book.read<app.absplus.android.plugins.AbsLog>(key) } catch (e: Exception) { null }
      }.sortedBy { it.timestamp }
      if (legacy.isNotEmpty()) {
        synchronized(fileLock) {
          writeBatchLocked(listOf(Entry(System.currentTimeMillis(), 'I', "N", "Diagnostics", "--- Imported ${legacy.size} entries from the previous app log ---", Process.myPid())) +
            legacy.map { Entry(it.timestamp, if (it.level == "error") 'E' else 'I', "N", it.tag.ifEmpty { "AbsLogger" }, it.message, 0) })
        }
      }
      book.destroy()
    } catch (e: Exception) {
      Log.e("DiagnosticLog", "Legacy log migration failed: $e")
    }
    prefs(ctx).edit().putBoolean(KEY_LEGACY_MIGRATED, true).apply()
  }
}

/**
 * Drop-in for android.util.Log in playback/session code: always logs to Logcat exactly as before, and
 * persists to the diagnostic log when the level allows (d/i/w/e at DEBUG+, v at VERBOSE).
 */
object DLog {
  fun v(tag: String, msg: String): Int { DiagnosticLog.write('V', tag, msg, DiagnosticLog.Persist.VERBOSE); return Log.v(tag, msg) }
  fun d(tag: String, msg: String): Int { DiagnosticLog.write('D', tag, msg, DiagnosticLog.Persist.DEBUG); return Log.d(tag, msg) }
  fun i(tag: String, msg: String): Int { DiagnosticLog.write('I', tag, msg, DiagnosticLog.Persist.DEBUG); return Log.i(tag, msg) }
  fun w(tag: String, msg: String): Int { DiagnosticLog.write('W', tag, msg, DiagnosticLog.Persist.DEBUG); return Log.w(tag, msg) }
  fun w(tag: String, msg: String, tr: Throwable): Int { DiagnosticLog.write('W', tag, "$msg\n${Log.getStackTraceString(tr)}", DiagnosticLog.Persist.DEBUG); return Log.w(tag, msg, tr) }
  fun e(tag: String, msg: String): Int { DiagnosticLog.write('E', tag, msg, DiagnosticLog.Persist.DEBUG); return Log.e(tag, msg) }
  fun e(tag: String, msg: String, tr: Throwable): Int { DiagnosticLog.write('E', tag, "$msg\n${Log.getStackTraceString(tr)}", DiagnosticLog.Persist.DEBUG); return Log.e(tag, msg, tr) }
  fun marker(text: String) = DiagnosticLog.marker(text)
}
