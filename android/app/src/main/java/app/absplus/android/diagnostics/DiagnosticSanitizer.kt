package app.absplus.android.diagnostics

/**
 * Applied to every persisted diagnostic line (native and JS), so individual log calls don't have to
 * remember to redact. Removes credentials/tokens, filesystem locations and encoded identifiers, and
 * replaces server hosts with a coarse category. Idempotent and linear-time on long lines.
 */
object DiagnosticSanitizer {
  /** Longest message kept after sanitizing; whole serialized objects don't belong in diagnostics. */
  const val MAX_MESSAGE_CHARS = 4000

  /**
   * Bump whenever the rules change: stored logs written under older rules are then re-sanitized in
   * place once (DiagnosticLog), so nothing written by an older app version survives unscrubbed.
   * 1 = v128 rules; 2 = encoded values, paths, URIs, config ids, custom headers, length cap.
   */
  const val RULES_VERSION = 2

  private const val SENSITIVE_KEYS =
    "access_token|accesstoken|refresh_token|refreshtoken|x-refresh-token|token|api_key|apikey|password|passwd|pwd|secret|client_secret|" +
      "authorization|cookie|set-cookie|code_verifier|storepassword|keypassword|username|userid|serveruserid|" +
      // Server connection config ids are base64("<server address>@<username>"); addresses/paths/URIs of files and folders
      "serverconnectionconfigid|lastserverconnectionconfigid|serveraddress|address|" +
      "absolutepath|basepath|fullpath|contenturl|coverabsolutepath|covercontenturl|path|relpath|coverpath|imagepath"

  private val bearer = Regex("(?i)\\b(bearer|basic)\\s+[A-Za-z0-9\\-._~+/]+=*")
  private val jwt = Regex("\\beyJ[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]*")
  // key=value, key: value, "key":"value" (JSON, headers, query strings)
  private val keyValue = Regex("(?i)([\"']?\\b(?:$SENSITIVE_KEYS)\\b[\"']?\\s*[:=]\\s*)(?!\\[REDACTED)(\"[^\"]*\"|'[^']*'|[^\\s,&;}\\]\\)]+)")
  // Note: Android's ICU regex engine rejects an unescaped literal '}' (the JVM accepts it) - keep it escaped
  private val customHeaders = Regex("(?i)([\"']?customHeaders[\"']?\\s*[:=]\\s*)\\{[^}]*\\}")
  // scheme://[user:pass@]host[:port] - path is kept (item ids are useful), host is categorised
  // (host never starts with '[' unless it's an IPv6 literal, so already-sanitized "[server:...]" is left alone)
  private val url = Regex("(?i)\\b(https?|wss?)://(?:[^\\s/@\\[]+@)?(\\[[0-9a-f:.]+]|[^\\s/:?#\"'<>)\\[\\]]+)(:\\d{1,5})?")
  // Android content/file URIs carry folder and file names (SAF tree/document ids); keep only the provider
  private val contentUri = Regex("(?i)\\bcontent://([A-Za-z0-9._-]+)(?!/\\[REDACTED)(/[^\\s\"',;|)\\]}]*)?")
  private val fileUri = Regex("(?i)\\bfile://(?!\\[device-file)[^\\s\"',;|)\\]}]*")
  // Absolute device paths; directory segments may contain spaces when followed by another '/'
  private val devicePath = Regex("(?<![A-Za-z0-9._\\-/:\\]])/(storage|sdcard|mnt|data/user|data/data|data/media)((?:/[^/\\n\"',;|)\\]}]*(?=/))*(?:/[^/\\s\"',;|)\\]}]*)?)")
  // Candidate base64/base64url tokens (ids built by encoding URLs, paths or SAF document ids)
  // Bounded to 2048 chars (~1.5 KB decoded - far longer than any encoded id/path/URL the app builds) so
  // long runs of base64-alphabet text aren't decoded; the lookarounds make an over-long run not match at all
  private val encodedToken = Regex("(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{16,2048}={0,2}(?![A-Za-z0-9+/_=-])")
  // Server connection names are "<address> (<username>)"
  private val serverUser = Regex("(\\[server:[a-z-]+](?::\\d{1,5})?/?)\\s*\\(([^)]{1,100})\\)")
  // Bounded lengths keep this linear on long lines (an unbounded local part is quadratic without '@')
  private val email = Regex("[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\\.[A-Za-z]{2,24}")

  fun sanitize(input: String): String {
    if (input.isEmpty()) return input
    // Each pass only runs when its trigger can be present, so ordinary lines stay cheap
    var s = input
    s = encodedToken.replace(s) { if (decodesToSensitive(it.value)) "[REDACTED_ENCODED]" else it.value }
    if (s.contains("bearer", true) || s.contains("basic", true)) s = bearer.replace(s) { "${it.groupValues[1]} [REDACTED]" }
    if (s.contains("eyJ")) s = jwt.replace(s, "[REDACTED_TOKEN]")
    if (s.contains("customHeaders", true)) s = customHeaders.replace(s) { "${it.groupValues[1]}[REDACTED]" }
    if (s.contains('=') || s.contains(':')) s = keyValue.replace(s) { "${it.groupValues[1]}[REDACTED]" }
    if (s.contains("content://", true)) s = contentUri.replace(s) { "content://${it.groupValues[1]}/[REDACTED]" }
    if (s.contains("file://", true)) s = fileUri.replace(s, "file://[device-file]")
    if (s.contains('/')) s = devicePath.replace(s) { "[${pathKind(it.groupValues[1])}]" }
    if (s.contains("://")) s = url.replace(s) { "${it.groupValues[1].lowercase()}://[server:${hostKind(it.groupValues[2])}]${it.groupValues[3]}" }
    if (s.contains("[server:")) s = serverUser.replace(s) { "${it.groupValues[1]} ([user])" }
    if (s.contains('@')) s = email.replace(s, "[email]")
    if (s.length > MAX_MESSAGE_CHARS) s = s.substring(0, MAX_MESSAGE_CHARS) + "…[truncated ${s.length - MAX_MESSAGE_CHARS} chars]"
    return s
  }

  private fun pathKind(root: String): String = when (root) {
    "data/user", "data/data" -> "app-private-file"
    else -> "device-file"
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

  // Encoding is not sanitization: redact tokens that decode to a URL, device path, content URI,
  // SAF document id ("primary:Audiobooks/..."), or "<address>@<username>" style value.
  private val sensitiveDecoded = Regex("(?i)(://|^/[^/]+/|^(content|file):|^[a-z0-9._-]{1,40}:[^:\\s]*[/A-Za-z]|@)")

  private fun decodesToSensitive(token: String): Boolean {
    val decoded = base64Decode(token) ?: return false
    if (decoded.length < 6) return false
    if (decoded.any { it.code < 0x20 && it != '\t' || it == '�' }) return false
    return sensitiveDecoded.containsMatchIn(decoded)
  }

  /** Minimal base64/base64url decoder (java.util.Base64 needs API 26; android.util.Base64 isn't available in JVM tests). */
  private fun base64Decode(token: String): String? {
    val clean = token.trimEnd('=')
    if (clean.length % 4 == 1) return null
    val out = java.io.ByteArrayOutputStream(clean.length * 3 / 4)
    var buffer = 0
    var bits = 0
    for (c in clean) {
      val v = when (c) {
        in 'A'..'Z' -> c - 'A'
        in 'a'..'z' -> c - 'a' + 26
        in '0'..'9' -> c - '0' + 52
        '+', '-' -> 62
        '/', '_' -> 63
        else -> return null
      }
      buffer = (buffer shl 6) or v
      bits += 6
      if (bits >= 8) {
        bits -= 8
        out.write((buffer shr bits) and 0xFF)
      }
    }
    return try {
      val bytes = out.toByteArray()
      val decoder = Charsets.UTF_8.newDecoder()
      decoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString()
    } catch (e: Exception) {
      null
    }
  }
}
