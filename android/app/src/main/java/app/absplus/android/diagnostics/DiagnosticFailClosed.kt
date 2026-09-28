package app.absplus.android.diagnostics

/**
 * Fail-closed wrapper around sanitization. Deliberately separate from DiagnosticSanitizer: if that
 * object fails to initialize (e.g. a regex the Android ICU engine rejects), every later access throws
 * NoClassDefFoundError, which this still catches. On any failure the original text is never returned.
 */
object DiagnosticFailClosed {
  const val PLACEHOLDER = "[diagnostic message omitted: sanitization failure]"

  fun sanitize(text: String, onFailure: (Throwable) -> Unit = {}, sanitizer: (String) -> String): String =
    try {
      sanitizer(text)
    } catch (t: Throwable) {
      try { onFailure(t) } catch (_: Throwable) {}
      PLACEHOLDER
    }
}
