import { Capacitor } from '@capacitor/core'
import { AbsLogger } from '@/plugins/capacitor'

// JS side of the persistent diagnostic log (see native DiagnosticLog). Entries are batched into a
// single bridge call; native decides persistence by level, sanitizes, timestamps and writes them.
const LEVEL_VALUE = { NORMAL: 0, DEBUG: 1, VERBOSE: 2 }
const FLUSH_MS = 500
const MAX_BATCH = 100
const MAX_ARG_CHARS = 2000

function formatArg(arg) {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`
  if (typeof arg === 'string') return arg
  try {
    const s = JSON.stringify(arg)
    return s && s.length > MAX_ARG_CHARS ? s.slice(0, MAX_ARG_CHARS) + '…' : String(s)
  } catch (error) {
    return String(arg)
  }
}

class Diagnostics {
  constructor() {
    this.enabled = Capacitor.getPlatform() === 'android'
    this.level = 'NORMAL'
    this.queue = []
    this.timer = null
    this.groupDepth = 0
  }

  get levelValue() {
    return LEVEL_VALUE[this.level] || 0
  }

  async init() {
    if (!this.enabled) return
    this.wrapConsole()
    window.addEventListener('error', (evt) => this.push('error', 'window', `${evt.message} (${evt.filename}:${evt.lineno}:${evt.colno})`))
    window.addEventListener('unhandledrejection', (evt) => this.push('error', 'window', `Unhandled promise rejection: ${formatArg(evt.reason)}`))
    document.addEventListener('visibilitychange', () => {
      this.debug('App', `UI visibility: ${document.visibilityState}`)
      if (document.visibilityState === 'hidden') this.flush()
    })
    try {
      const { level } = await AbsLogger.getDiagnosticLevel()
      this.level = level || 'NORMAL'
    } catch (error) {
      this.level = 'NORMAL'
    }
    this.debug('App', '--- App UI (JS) started ---')
  }

  setLevel(level) {
    this.level = level
  }

  push(level, tag, message) {
    if (!this.enabled) return
    if (this.levelValue < (level === 'verbose' ? 2 : 1)) return
    this.queue.push({ level, tag, message: String(message), timestamp: Date.now() })
    if (this.queue.length >= MAX_BATCH) this.flush()
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), FLUSH_MS)
  }

  flush() {
    clearTimeout(this.timer)
    this.timer = null
    if (!this.queue.length) return
    const entries = this.queue.splice(0)
    AbsLogger.logBatch({ entries }).catch(() => {})
  }

  debug(tag, message) {
    this.push('debug', tag, message)
  }
  verbose(tag, message) {
    this.push('verbose', tag, message)
  }
  warn(tag, message) {
    this.push('warn', tag, message)
  }
  error(tag, message) {
    this.push('error', tag, message)
  }

  wrapConsole() {
    const wrap = (method, level) => {
      const original = console[method]
      if (!original) return
      console[method] = (...args) => {
        original.apply(console, args)
        // Capacitor's debug-build bridge logging (including our own logBatch calls) happens inside
        // console groups; skipping grouped output prevents a capture->flush->log feedback loop
        if (this.groupDepth > 0) return
        try {
          this.push(level, 'console', args.map(formatArg).join(' '))
        } catch (error) {}
      }
    }
    ;['group', 'groupCollapsed'].forEach((method) => {
      const original = console[method]
      if (!original) return
      console[method] = (...args) => {
        this.groupDepth++
        original.apply(console, args)
      }
    })
    const originalGroupEnd = console.groupEnd
    if (originalGroupEnd) {
      console.groupEnd = (...args) => {
        this.groupDepth = Math.max(0, this.groupDepth - 1)
        originalGroupEnd.apply(console, args)
      }
    }
    wrap('error', 'error')
    wrap('warn', 'warn')
    wrap('log', 'verbose')
    wrap('info', 'verbose')
    wrap('debug', 'verbose')
  }
}

export default (context, inject) => {
  const diagnostics = new Diagnostics()
  inject('diag', diagnostics)
  diagnostics.init()
}
