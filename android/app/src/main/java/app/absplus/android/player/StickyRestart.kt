package app.absplus.android.player

import android.content.Intent

/**
 * The player service returns START_STICKY. Every start the app makes itself carries an intent
 * (preparePlayer, MediaButtonReceiver), so a null intent means the system recreated the service after
 * its process died. The new instance has nothing prepared, yet Android keeps the old foreground
 * notification attached to the service, and its actions belong to the dead process.
 */
internal object StickyRestart {
  /**
   * True when the service was recreated empty: it should drop the stale notification and stop. The
   * session stays resumable, so a widget/headset Play still restores it; this is not a user Close.
   */
  fun isEmptyRestart(intent: Intent?, hasPreparedSession: Boolean, isRestoringPlayback: Boolean): Boolean =
    intent == null && !hasPreparedSession && !isRestoringPlayback
}
