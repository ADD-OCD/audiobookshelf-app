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

  @Test fun leavesOrdinaryDiagnosticsAlone() {
    val msg = "Session rebuilt for d8231d60-7cfd-4318-9627-1b242081fe1d | position=254.832s | rate=1.5 | playWhenReady=true"
    assertEquals(msg, s(msg))
  }
}
