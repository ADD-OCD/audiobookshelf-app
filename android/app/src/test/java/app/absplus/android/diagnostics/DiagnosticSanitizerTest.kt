package app.absplus.android.diagnostics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticSanitizerTest {
  private fun s(input: String) = DiagnosticSanitizer.sanitize(input)

  @Test fun redactsBearerAndJwt() {
    val out = s("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJhYmMifQ.c2lnbmF0dXJl")
    assertFalse(out.contains("eyJ"))
    assertFalse(out.contains("c2lnbmF0dXJl"))
    assertTrue(out.contains("[REDACTED]"))
  }

  @Test fun redactsKeyValueSecrets() {
    val out = s("""{"username":"alice","password":"hunter2","refreshToken":"abc.def","token":"t0k3n"} x-refresh-token: r3fr35h""")
    listOf("alice", "hunter2", "abc.def", "t0k3n", "r3fr35h").forEach { assertFalse("leaked $it in $out", out.contains(it)) }
  }

  @Test fun redactsQueryStringSecrets() {
    val out = s("GET https://abs.example.com/api/items/li_1/cover?token=SECRET123&width=400")
    assertFalse(out.contains("SECRET123"))
    assertTrue(out.contains("width=400"))
    assertTrue(out.contains("/api/items/li_1/cover"))
  }

  @Test fun categorisesServerHostsAndKeepsPortAndPath() {
    assertEquals("http://[server:lan-ip]:13378/api/me", s("http://192.168.1.20:13378/api/me"))
    assertEquals("https://[server:domain]/status", s("https://books.example.org/status"))
    assertEquals("http://[server:localhost]:13378", s("http://127.0.0.1:13378"))
    assertEquals("http://[server:lan-ip]:13378", s("http://10.0.2.2:13378"))
    assertEquals("https://[server:local-name]", s("https://nas.local"))
    assertEquals("http://[server:public-ip]:80/x", s("http://8.8.8.8:80/x"))
  }

  @Test fun removesUrlCredentialsAndServerUsername() {
    val out = s("Connected to http://bob:pw@nas.lan:13378 (bob)")
    assertFalse(out.contains("bob"))
    assertFalse(out.contains("pw"))
    assertTrue(out.contains("([user])"))
  }

  @Test fun isIdempotent() {
    listOf(
      "server http://192.168.1.20:13378 (alice), token=abc",
      "https://books.example.org:443/api?api_key=xyz Bearer abc.def",
      "http://[fe80::1]:13378/x"
    ).forEach {
      val once = s(it)
      assertEquals(once, s(once))
    }
  }

  @Test fun redactsEmail() {
    assertFalse(s("user someone@example.com logged in").contains("someone@example.com"))
  }

  @Test fun longLinesAreFast() {
    val lines = listOf("x".repeat(8000), "a@".repeat(4000), ("token=" + "y".repeat(50) + " ").repeat(100), "http://" + "h".repeat(7990))
    val start = System.nanoTime()
    repeat(200) { lines.forEach { s(it) } }
    val ms = (System.nanoTime() - start) / 1_000_000
    assertTrue("800 long lines took ${ms}ms", ms < 3000)
  }

  // --- Cases found in the v128 physical-device log / follow-up audit ---

  private fun b64url(v: String) = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(v.toByteArray())
  private fun b64default(v: String) = java.util.Base64.getMimeEncoder().encodeToString(v.toByteArray()) + "\n"
  private fun assertNoneOf(out: String, vararg leaks: String) = leaks.forEach { assertFalse("leaked '$it' in: $out", out.contains(it)) }

  @Test fun redactsServerConnectionConfigIdAndItsEncodedValueAnywhere() {
    // The app builds this id as base64url("<server address>@<username>")
    val id = b64url("http://192.168.1.20:13378@alice")
    assertNoneOf(s("Sync local device current serverConnectionConfigId=$id"), id, "alice", "192.168.1.20")
    assertNoneOf(s("""{"serverConnectionConfigId":"$id","lastServerConnectionConfigId":"$id"}"""), id)
    // Same value with no key in front of it (encoding is not sanitization)
    val out = s("No refresh token or server configuration for $id")
    assertNoneOf(out, id)
    assertTrue(out.contains("[REDACTED_ENCODED]"))
  }

  @Test fun redactsEncodedPathsAndSafFolderIds() {
    val fileId = b64url("/storage/emulated/0/Audiobooks/Test Author/Book/01.mp3")
    val folderId = b64default("primary:Audiobooks").trim()
    val uriId = b64url("content://com.android.externalstorage.documents/tree/primary%3AAudiobooks")
    assertNoneOf(s("file id $fileId folder $folderId uri $uriId"), fileId, folderId, uriId)
  }

  @Test fun keepsNonSensitiveIds() {
    val uuid = "d8231d60-7cfd-4318-9627-1b242081fe1d"
    val localItemId = "local_" + b64url(uuid)
    val msg = "prepareLibraryItem: item=$localItemId server=$uuid tag=PlayerNotificationServ handleCallMediaButton advancePlaylistQueue"
    assertEquals(msg, s(msg))
  }

  @Test fun redactsAbsolutePathsIncludingSpaces() {
    val out = s("Move completed for 01.mp3 to /storage/emulated/0/Audiobooks/Test Author/Restore Book A/01 - Part One.wav")
    assertNoneOf(out, "/storage", "Audiobooks", "Test Author", "Restore Book A")
    assertTrue(out.contains("[device-file]"))
    assertNoneOf(s("Could not delete expired staging file /data/user/0/app.absplus.android/files/download-staging/x.tmp"), "/data/user", "download-staging")
    assertNoneOf(s("path /sdcard/Download/Books/a.m4b"), "/sdcard", "Books")
  }

  @Test fun redactsBasePathAndPathKeys() {
    val out = s("""{"basePath":"/storage/emulated/0/Audiobooks","absolutePath":"/storage/emulated/0/Audiobooks/Book","fullPath":"/x/y","path":"/audiobooks/Author/Title","relPath":"Author/Title/01.mp3","coverPath":"/metadata/items/1/cover.jpg"}""")
    assertNoneOf(out, "Audiobooks", "/audiobooks/Author", "Author/Title/01.mp3", "/metadata/items")
  }

  @Test fun redactsContentAndFileUris() {
    val saf = "content://com.android.externalstorage.documents/tree/primary%3AAudiobooks/document/primary%3AAudiobooks%2FTest%20Author%2F01.mp3"
    val out = s("Added local audio track $saf (x)")
    assertNoneOf(out, "Audiobooks", "Test%20Author", "primary%3A")
    assertTrue(out.contains("content://com.android.externalstorage.documents/[REDACTED]"))
    assertNoneOf(s("""{"contentUrl":"$saf","coverContentUrl":"$saf"}"""), "Audiobooks")
    assertNoneOf(s("opening file:///storage/emulated/0/Audiobooks/b.m4b now"), "Audiobooks")
  }

  @Test fun redactsCustomHeadersAndCookies() {
    val out = s("""{"customHeaders":{"CF-Access-Client-Secret":"sekr3t","X-Api":"k"},"Cookie":"sid=abc123"}""")
    assertNoneOf(out, "sekr3t", "abc123")
  }

  @Test fun serializedLocalLibraryItemIsReducedToSafeFields() {
    val uuid = "62bd8c42-6aec-49da-8912-aadafd32165e"
    val cfg = b64url("http://nas.example.org:13378@bob")
    val folder = b64default("primary:Audiobooks").trim()
    val obj = """{"id":"local_${b64url(uuid)}","folderId":"$folder","basePath":"/storage/emulated/0/Audiobooks","absolutePath":"/storage/emulated/0/Audiobooks/Book",""" +
      """"contentUrl":"content://com.android.externalstorage.documents/tree/primary%3AAudiobooks","isInvalid":false,"mediaType":"book",""" +
      """"media":{"metadata":{"title":"Restore Book B","description":"${"long description ".repeat(400)}"}},""" +
      """"serverConnectionConfigId":"$cfg","serverAddress":"http://nas.example.org:13378","serverUserId":"u1","libraryItemId":"$uuid"}"""
    val out = s("prepareLibraryItem: Preparing Local Media item $obj")
    assertNoneOf(out, cfg, folder, "Audiobooks", "nas.example.org", "bob")
    assertTrue(out.contains("\"mediaType\":\"book\""))
    assertTrue(out.contains("local_${b64url(uuid)}"))
    assertTrue(out.contains("…[truncated"))
    assertTrue("not capped: ${out.length}", out.length <= DiagnosticSanitizer.MAX_MESSAGE_CHARS + 40)
  }

  @Test fun encodedValuesUpToTheBoundAreStillCaught() {
    // A long but realistic encoded path (well under the 2048-char token bound)
    val longPath = "/storage/emulated/0/" + "Audiobooks/Some Long Author Name/".repeat(20) + "book.m4b"
    val id = b64url(longPath)
    assertTrue(id.length in 16..2048)
    assertNoneOf(s("local file $id"), id)
    // An over-long run of base64-alphabet characters is left as-is (not decoded), not partially redacted
    val out = s("v " + "x".repeat(5000))
    assertFalse(out.contains("[REDACTED_ENCODED]"))
    assertTrue(out.startsWith("v " + "x".repeat(100)))
  }

  @Test fun redactsServerUserId() {
    val out = s("""{"serverUserId":"5a1943f4-3463-472b-914a-dc28f18db566","userId":"u-2","libraryItemId":"62bd8c42-6aec-49da-8912-aadafd32165e"}""")
    assertNoneOf(out, "5a1943f4-3463-472b-914a-dc28f18db566", "u-2")
    assertTrue(out.contains("62bd8c42-6aec-49da-8912-aadafd32165e"))
  }

  @Test fun sanitizesExportHeader() {
    val header = "Server connected: true, server http://my-home-nas.example.com:13378 (carol), server version 2.36.1\nResumable session saved: true (downloaded, item 62bd8c42-6aec-49da-8912-aadafd32165e)"
    val out = s(header)
    assertNoneOf(out, "my-home-nas", "carol")
    assertTrue(out.contains("62bd8c42-6aec-49da-8912-aadafd32165e"))
  }

  @Test fun newRulesAreIdempotent() {
    listOf(
      "id=${b64url("http://1.2.3.4@x")} /storage/emulated/0/A B/c.mp3 content://a.b/tree/x file:///sdcard/x",
      """{"basePath":"/storage/emulated/0/A","customHeaders":{"a":"b"},"serverConnectionConfigId":"abc"}"""
    ).forEach {
      val once = s(it)
      assertEquals(once, s(once))
    }
  }

  @Test fun leavesOrdinaryDiagnosticsAlone() {
    val msg = "Session rebuilt for d8231d60-7cfd-4318-9627-1b242081fe1d | position=254.832s | rate=1.5 | playWhenReady=true"
    assertEquals(msg, s(msg))
  }
}
