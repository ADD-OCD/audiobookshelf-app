import { Dialog } from '@capacitor/dialog'
import { AbsLogger } from '@/plugins/capacitor'

// Shared by Settings (Diagnostics section) and the log viewer page
export default {
  data() {
    return {
      diagnosticLevel: 'NORMAL',
      diagnosticLogBytes: null,
      isSharingDiagnosticLog: false
    }
  },
  computed: {
    diagnosticLevelItems() {
      return [
        { text: this.$strings.LabelDiagnosticLevelNormal, value: 'NORMAL' },
        { text: this.$strings.LabelDiagnosticLevelDebug, value: 'DEBUG' },
        { text: this.$strings.LabelDiagnosticLevelVerbose, value: 'VERBOSE' }
      ]
    },
    diagnosticLevelOption() {
      return this.diagnosticLevelItems.find((i) => i.value === this.diagnosticLevel)?.text || this.diagnosticLevel
    }
  },
  methods: {
    async loadDiagnosticState() {
      try {
        const info = await AbsLogger.getDiagnosticInfo()
        this.diagnosticLevel = info.level
        this.diagnosticLogBytes = info.totalBytes
      } catch (error) {
        console.error('[Diagnostics] Failed to load diagnostic state', error)
      }
    },
    async setDiagnosticLevel(level) {
      try {
        const res = await AbsLogger.setDiagnosticLevel({ level })
        this.diagnosticLevel = res.level
        this.$diag.setLevel(res.level)
        this.$diag.debug('Settings', `Diagnostic logging level set to ${res.level}`)
      } catch (error) {
        this.$toast.error(error.message || String(error))
      }
      this.loadDiagnosticState()
    },
    async shareDiagnosticLog() {
      if (this.isSharingDiagnosticLog) return
      this.isSharingDiagnosticLog = true
      this.$diag.flush()
      try {
        await AbsLogger.shareDiagnosticLog()
      } catch (error) {
        this.$toast.error(error.message || String(error))
      } finally {
        this.isSharingDiagnosticLog = false
      }
    },
    async clearDiagnosticLog() {
      const { value } = await Dialog.confirm({ title: this.$strings.ButtonClearDiagnosticLog, message: this.$strings.MessageConfirmClearDiagnosticLog })
      if (!value) return
      await AbsLogger.clearDiagnosticLog()
      this.$toast.success(this.$strings.ToastDiagnosticLogCleared)
      await this.loadDiagnosticState()
      this.onDiagnosticLogChanged?.()
    },
    async addDiagnosticMarker() {
      const { value, cancelled } = await Dialog.prompt({ title: this.$strings.ButtonAddDiagnosticMarker, message: this.$strings.MessageDiagnosticMarkerPrompt })
      if (cancelled) return
      this.$diag.flush()
      await AbsLogger.addDiagnosticMarker({ note: value || '' })
      this.$toast.success(this.$strings.ToastDiagnosticMarkerAdded)
      this.onDiagnosticLogChanged?.()
    }
  }
}
