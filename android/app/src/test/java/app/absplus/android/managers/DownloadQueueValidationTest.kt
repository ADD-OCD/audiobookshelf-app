package app.absplus.android.managers

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import app.absplus.android.data.LocalFolder
import app.absplus.android.data.MediaType
import app.absplus.android.data.MediaTypeMetadata
import app.absplus.android.models.DownloadItem
import app.absplus.android.models.DownloadItemPart
import io.paperdb.Paper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Upstream v0.14.2-beta's startup validation of the persisted download queue
 * (DbManager.ensureValidDownloadQueue), run against the fork's download models and its
 * failure/cleanup bookkeeping.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class DownloadQueueValidationTest {
  private val book get() = Paper.book("downloadItems")
  private val db = DbManager()

  @Before
  fun setUp() {
    Paper.init(ApplicationProvider.getApplicationContext<Context>())
    book.destroy()
  }

  private fun part(itemId: String, name: String, serverPath: String = "/api/items/$itemId/file/$name") =
          DownloadItemPart(
                  id = "part-$itemId-$name",
                  downloadItemId = itemId,
                  filename = name,
                  fileSize = 10,
                  destinationPath = "/staging/$name",
                  finalDestinationPath = "/final/$name",
                  serverPath = serverPath,
                  localFolderName = "Audiobooks",
                  localFolderUrl = "content://folder",
                  localFolderId = "internal-books",
                  ebookFile = null,
                  audioTrack = null,
                  episode = null,
                  completed = false,
                  moved = false,
                  isMoving = false,
                  failed = false,
                  uri = Uri.parse("http://server/file"),
                  destinationUri = Uri.parse("file:///staging/$name"),
                  finalDestinationUri = Uri.parse("file:///final/$name"),
                  completedDestinationUri = null,
                  finalDestinationSubfolder = "Book",
                  downloadId = null,
                  lastUpdateTime = null,
                  progress = 0,
                  bytesDownloaded = 0
          )

  private fun item(id: String, libraryItemId: String = "li-$id", parts: MutableList<DownloadItemPart> = mutableListOf(part(id, "01.mp3"), part(id, "02.mp3"))) =
          DownloadItem(
                  id = id,
                  libraryItemId = libraryItemId,
                  episodeId = null,
                  userMediaProgress = null,
                  serverConnectionConfigId = "server",
                  serverAddress = "http://server",
                  serverUserId = "user",
                  mediaType = "book",
                  itemFolderPath = "/final",
                  localFolder = LocalFolder("internal-books", "Audiobooks", "content://folder", "/base", "/abs", "internal", "book"),
                  itemTitle = "Title $id",
                  itemSubfolder = "Book",
                  media = MediaType(MediaTypeMetadata("Title $id", false), null),
                  downloadItemParts = parts
          )

  @Test
  fun emptyQueueIsValid() {
    assertTrue(db.ensureValidDownloadQueue())
    assertEquals(0, book.allKeys.size)
  }

  @Test
  fun validQueueIsKeptIntact() {
    db.saveDownloadItem(item("a"))
    db.saveDownloadItem(item("b"))
    assertTrue(db.ensureValidDownloadQueue())
    assertEquals(setOf("a", "b"), book.allKeys.toSet())
    assertEquals(2, db.getDownloadItems().size)
  }

  @Test
  fun forkFailureAndCleanupBookkeepingStillPassesValidation() {
    val failed = item("failed")
    failed.terminalFailureAt = 1L
    failed.stagingCleanupAt = 2L
    failed.downloadItemParts.forEach {
      it.failed = true
      it.permissionLost = true
      it.failureReason = "lost folder access"
    }
    db.saveDownloadItem(failed)
    db.saveDownloadItem(item("ok"))
    assertTrue(db.ensureValidDownloadQueue())
    assertEquals(setOf("failed", "ok"), book.allKeys.toSet())
  }

  @Test
  fun oneInvalidEntryClearsTheWholeQueue() {
    db.saveDownloadItem(item("ok"))
    db.saveDownloadItem(item("bad", parts = mutableListOf(part("bad", "01.mp3", serverPath = ""))))
    assertTrue(db.ensureValidDownloadQueue())
    assertEquals(0, book.allKeys.size)
  }

  @Test
  fun entriesWithoutPartsOrWithBlankIdentityAreInvalid() {
    db.saveDownloadItem(item("noparts", parts = mutableListOf()))
    assertTrue(db.ensureValidDownloadQueue())
    assertEquals(0, book.allKeys.size)
    db.saveDownloadItem(item("blank", libraryItemId = ""))
    assertTrue(db.ensureValidDownloadQueue())
    assertEquals(0, book.allKeys.size)
  }

  @Test
  fun keyThatDoesNotMatchTheStoredItemIsInvalid() {
    book.write("other-key", item("a"))
    assertTrue(db.ensureValidDownloadQueue())
    assertEquals(0, book.allKeys.size)
  }

  @Test
  fun unreadableOrForeignEntryIsClearedInsteadOfCrashingStartup() {
    db.saveDownloadItem(item("ok"))
    book.write("garbage", "not a download item")
    assertTrue(db.ensureValidDownloadQueue())
    assertEquals(0, book.allKeys.size)
  }
}
