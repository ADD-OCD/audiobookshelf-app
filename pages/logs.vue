<template>
  <div class="w-full h-full py-4 flex flex-col">
    <div class="flex items-center mb-1 space-x-2 px-4">
      <p class="text-lg font-bold">{{ $strings.ButtonLogs }}</p>
      <ui-icon-btn outlined borderless :icon="isCopied ? 'check' : 'content_copy'" :aria-label="$strings.ButtonCopyLog" @click="copyToClipboard" />
      <ui-icon-btn outlined borderless icon="download" :aria-label="$strings.ButtonSaveDiagnosticLog" :loading="isSavingDiagnosticLog" @click="saveDiagnosticLog" />
      <ui-icon-btn outlined borderless icon="share" :aria-label="$strings.ButtonShareDiagnosticLog" :loading="isSharingDiagnosticLog" @click="shareDiagnosticLog" />
      <div class="flex-grow"></div>
      <ui-icon-btn outlined borderless icon="more_vert" :aria-label="$strings.LabelMore" @click="showDialog = true" />
    </div>
    <p class="px-4 text-xs text-fg-muted">
      {{ $strings.LabelDiagnosticLogging }}: {{ diagnosticLevelOption }}
      <span v-if="diagnosticLogBytes !== null"> · {{ $strings.LabelDiagnosticLogSize }}: {{ $bytesPretty(diagnosticLogBytes) }}</span>
    </p>
    <p v-if="truncated" class="px-4 text-xs text-fg-muted">{{ $strings.MessageDiagnosticLogShowingRecent }}</p>

    <div class="w-full flex-grow overflow-y-auto relative mt-2 diag-log" ref="logContainer" @scroll="onScroll">
      <div v-if="!lines.length && !isLoading" class="flex items-center justify-center h-32 p-4">
        <p class="text-gray-400">{{ $strings.MessageNoLogs }}</p>
      </div>
      <div v-if="truncated" class="flex justify-center py-2">
        <ui-btn small @click="showMore">{{ $strings.ButtonShowMoreLog }}</ui-btn>
      </div>
      <div v-for="(line, index) in lines" :key="index" class="px-3 py-0.5 text-xs font-mono break-words whitespace-pre-wrap" :class="lineClass(line)">{{ line }}</div>
    </div>

    <modals-dialog v-model="showDialog" :items="dialogItems" @action="dialogAction" />
  </div>
</template>
<script>
import { AbsLogger } from '@/plugins/capacitor'
import diagnosticLogMixin from '@/mixins/diagnosticLog'

const INITIAL_BYTES = 256 * 1024
const MAX_BYTES = 2 * 1024 * 1024
const MAX_LINES = 6000

export default {
  mixins: [diagnosticLogMixin],
  data() {
    return {
      text: '',
      truncated: false,
      maxBytes: INITIAL_BYTES,
      isLoading: true,
      isCopied: false,
      showDialog: false,
      atBottom: true,
      refreshInterval: null
    }
  },
  computed: {
    lines() {
      // One entry per timestamped line (continuation lines such as stack traces stay attached).
      // JS entries are written in small batches, so order by timestamp for a single timeline.
      const entries = []
      for (const line of this.text.split('\n')) {
        if (!line) continue
        if (/^\d{4}-\d{2}-\d{2} /.test(line) || !entries.length) entries.push(line)
        else entries[entries.length - 1] += '\n' + line
      }
      const sortKey = (entry) => entry.slice(0, 23)
      const sorted = entries.map((entry, index) => ({ entry, index })).sort((a, b) => (sortKey(a.entry) < sortKey(b.entry) ? -1 : sortKey(a.entry) > sortKey(b.entry) ? 1 : a.index - b.index))
      const lines = sorted.map((e) => e.entry)
      return lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines
    },
    dialogItems() {
      return [
        { text: this.$strings.ButtonAddDiagnosticMarker, value: 'marker', icon: 'bookmark_add' },
        { text: this.$strings.ButtonRefreshLog, value: 'refresh', icon: 'refresh' },
        { text: this.$strings.ButtonClearDiagnosticLog, value: 'clear', icon: 'delete' }
      ]
    }
  },
  methods: {
    async dialogAction(action) {
      await this.$hapticsImpact()
      this.showDialog = false
      if (action === 'clear') await this.clearDiagnosticLog()
      else if (action === 'marker') await this.addDiagnosticMarker()
      else if (action === 'refresh') await this.loadLog(true)
    },
    lineClass(line) {
      // "yyyy-MM-dd HH:mm:ss.SSS+hh:mm L source/tag (pid): message"
      const level = (line.match(/^\S+ \S+ ([VDIWE]) /) || [])[1]
      if (level === 'E') return 'text-error'
      if (level === 'W') return 'text-warning'
      if (line.includes('--- ')) return 'text-fg font-semibold'
      if (level === 'V') return 'text-fg-muted'
      return 'text-fg'
    },
    async copyToClipboard() {
      await this.$hapticsImpact()
      this.$copyToClipboard(this.lines.join('\n')).then(() => {
        this.isCopied = true
        setTimeout(() => {
          this.isCopied = false
        }, 2000)
      })
    },
    onScroll() {
      const el = this.$refs.logContainer
      if (!el) return
      this.atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    },
    scrollToBottom() {
      const el = this.$refs.logContainer
      if (el) el.scrollTop = el.scrollHeight
    },
    showMore() {
      this.maxBytes = Math.min(this.maxBytes * 2, MAX_BYTES)
      this.loadLog(false)
    },
    onDiagnosticLogChanged() {
      this.loadLog(true)
    },
    async loadLog(scrollToEnd) {
      try {
        this.$diag.flush()
        const res = await AbsLogger.readDiagnosticLog({ maxBytes: this.maxBytes })
        this.text = res.text || ''
        this.truncated = !!res.truncated && this.maxBytes < MAX_BYTES
        this.diagnosticLevel = res.level
        this.diagnosticLogBytes = res.totalBytes
        if (scrollToEnd) this.$nextTick(this.scrollToBottom)
      } catch (error) {
        console.error('Failed to load logs', error)
        this.$toast.error('Failed to load logs: ' + (error.message || error))
      } finally {
        this.isLoading = false
      }
    }
  },
  mounted() {
    this.loadLog(true)
    // Keep following new entries while the user is at the bottom of the log
    this.refreshInterval = setInterval(() => {
      if (this.atBottom && document.visibilityState === 'visible') this.loadLog(true)
    }, 3000)
  },
  beforeDestroy() {
    clearInterval(this.refreshInterval)
  }
}
</script>

<style scoped>
.diag-log,
.diag-log * {
  -webkit-user-select: text;
  user-select: text;
}
</style>
