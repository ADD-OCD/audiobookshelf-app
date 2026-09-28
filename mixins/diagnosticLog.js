import { Dialog } from '@capacitor/dialog'
import { AbsLogger } from '@/plugins/capacitor'

// Shared by Settings (Diagnostics section) and the log viewer page
export default {
  data() {
    return {
      diagnosticLevel: 'NORMAL',
      diagnosticLogBytes: null,
      isSharingDiagnosticLog: false,
      isSavingDiagnosticLog: false
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
    },
    // Short visible label + icon, full accessible label
    diagnosticLogActions() {
      return [
        { id: 'view', text: this.$strings.ButtonLogActionView, icon: 'visibility', ariaLabel: this.$strings.ButtonViewDiagnosticLog, handler: this.viewDiagnosticLog },
        { id: 'save', text: this.$strings.ButtonLogActionSave, icon: 'download', ariaLabel: this.$strings.ButtonSaveDiagnosticLog, handler: this.saveDiagnosticLog },
        { id: 'share', text: this.$strings.ButtonLogActionShare, icon: 'share', ariaLabel: this.$strings.ButtonShareDiagnosticLog, handler: this.shareDiagnosticLog },
        { id: 'mark', text: this.$strings.ButtonLogActionMark, icon: 'bookmark_add', ariaLabel: this.$strings.ButtonAddDiagnosticMarker, handler: this.addDiagnosticMarker },
        { id: 'clear', text: this.$strings.ButtonLogActionClear, icon: 'delete', ariaLabel: this.$strings.ButtonClearDiagnosticLog, handler: this.clearDiagnosticLog }
      ]
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
    viewDiagnosticLog() {
      if (this.$route.path !== '/logs') this.$router.push('/logs')
    },
    async saveDiagnosticLog() {
      if (this.isSavingDiagnosticLog) return
      this.isSavingDiagnosticLog = true
      this.$diag.flush()
      try {
        const res = await AbsLogger.saveDiagnosticLog()
        if (!res?.cancelled) this.$toast.success(this.$getString('ToastDiagnosticLogSaved', [res.displayName]))
      } catch (error) {
        this.$toast.error(this.$getString('ToastDiagnosticLogSaveFailed', [error.message || String(error)]))
      } finally {
        this.isSavingDiagnosticLog = false
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
