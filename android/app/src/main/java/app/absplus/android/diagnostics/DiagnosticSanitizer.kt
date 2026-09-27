package app.absplus.android.diagnostics

/**
 * Applied to every persisted diagnostic line (native and JS), so individual log calls don't have to
 * remember to redact. Removes credentials/tokens and replaces server hosts with a coarse category.
 */
object DiagnosticSanitizer {
  private const val SENSITIVE_KEYS =
    "access_token|accesstoken|refresh_token|refreshtoken|x-refresh-token|token|api_key|apikey|password|passwd|pwd|secret|client_secret|" +
      "authorization|cookie|set-cookie|code_verifier|storepassword|keypassword|username"

  private val bearer = Regex("(?i)\\b(bearer|basic)\\s+[A-Za-z0-9\\-._~+/]+=*")
  private val jwt = Regex("\\beyJ[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]*")
  // key=value, key: value, "key":"value" (JSON, headers, query strings)
  private val keyValue = Regex("(?i)([\"']?\\b(?:$SENSITIVE_KEYS)\\b[\"']?\\s*[:=]\\s*)(?!\\[REDACTED)(\"[^\"]*\"|'[^']*'|[^\\s,&;}\\]\\)]+)")
  // scheme://[user:pass@]host[:port] - path is kept (item ids are useful), host is categorised
  // (host never starts with '[' unless it's an IPv6 literal, so already-sanitized "[server:...]" is left alone)
  private val url = Regex("(?i)\\b(https?|wss?)://(?:[^\\s/@\\[]+@)?(\\[[0-9a-f:.]+]|[^\\s/:?#\"'<>)\\[\\]]+)(:\\d{1,5})?")
  // Server connection names are "<address> (<username>)"
  private val serverUser = Regex("(\\[server:[a-z-]+](?::\\d{1,5})?/?)\\s*\\(([^)]{1,100})\\)")
  // Bounded lengths keep this linear on long lines (an unbounded local part is quadratic without '@')
  private val email = Regex("[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\\.[A-Za-z]{2,24}")

  fun sanitize(input: String): String {
    if (input.isEmpty()) return input
    // Each pass only runs when its trigger can be present, so ordinary lines stay cheap
    var s = input
    if (s.contains("bearer", true) || s.contains("basic", true)) s = bearer.replace(s) { "${it.groupValues[1]} [REDACTED]" }
    if (s.contains("eyJ")) s = jwt.replace(s, "[REDACTED_TOKEN]")
    if (s.contains('=') || s.contains(':')) s = keyValue.replace(s) { "${it.groupValues[1]}[REDACTED]" }
    if (s.contains("://")) s = url.replace(s) { "${it.groupValues[1].lowercase()}://[server:${hostKind(it.groupValues[2])}]${it.groupValues[3]}" }
    if (s.contains("[server:")) s = serverUser.replace(s) { "${it.groupValues[1]} ([user])" }
    if (s.contains('@')) s = email.replace(s, "[email]")
    return s
  }

  private fun hostKind(host: String): String {
    val h = host.lowercase().trim('[', ']')
    return when {
      h == "localhost" || h.startsWith("127.") || h == "::1" -> "localhost"
      Regex("^(10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.|169\\.254\\.|100\\.(6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.)").containsMatchIn(h) -> "lan-ip"
      Regex("^\\d{1,3}(\\.\\d{1,3}){3}$").matches(h) -> "public-ip"
      h.contains(':') -> "ipv6"
      h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home") || h.endsWith(".internal") || !h.contains('.') -> "local-name"
      else -> "domain"
    }
  }
}
