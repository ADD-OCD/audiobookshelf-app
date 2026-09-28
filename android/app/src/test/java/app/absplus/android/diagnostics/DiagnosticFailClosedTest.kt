package app.absplus.android.diagnostics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticFailClosedTest {
  private val secret = "password=hunter2 http://192.168.1.20:13378 (alice)"

  @Test fun returnsSanitizedTextWhenSanitizerWorks() {
    assertEquals("clean", DiagnosticFailClosed.sanitize(secret) { "clean" })
  }

  @Test fun failsClosedOnException() {
    val out = DiagnosticFailClosed.sanitize(secret) { throw IllegalStateException("boom") }
    assertEquals(DiagnosticFailClosed.PLACEHOLDER, out)
    assertFalse(out.contains("hunter2"))
  }

  @Test fun failsClosedOnInitializerAndClassErrors() {
    // What a regex the Android ICU engine rejects looks like: first ExceptionInInitializerError, then NoClassDefFoundError
    assertEquals(DiagnosticFailClosed.PLACEHOLDER, DiagnosticFailClosed.sanitize(secret) { throw ExceptionInInitializerError("bad regex") })
    assertEquals(DiagnosticFailClosed.PLACEHOLDER, DiagnosticFailClosed.sanitize(secret) { throw NoClassDefFoundError("DiagnosticSanitizer") })
    assertEquals(DiagnosticFailClosed.PLACEHOLDER, DiagnosticFailClosed.sanitize(secret) { throw StackOverflowError() })
  }

  @Test fun failureCallbackCannotBreakFailClosed() {
    var reported = false
    val out = DiagnosticFailClosed.sanitize(secret, onFailure = { reported = true; throw RuntimeException("logger also broken") }) { throw RuntimeException("x") }
    assertTrue(reported)
    assertEquals(DiagnosticFailClosed.PLACEHOLDER, out)
  }

  @Test fun realSanitizerPathStillRedacts() {
    val out = DiagnosticFailClosed.sanitize(secret) { DiagnosticSanitizer.sanitize(it) }
    assertFalse(out.contains("hunter2"))
    assertFalse(out.contains("alice"))
  }
}
