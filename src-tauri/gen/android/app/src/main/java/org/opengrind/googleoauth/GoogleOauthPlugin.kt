package org.opengrind.googleoauth

import android.app.Activity
import android.content.Intent
import android.os.SystemClock
import androidx.activity.result.ActivityResult
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.opengrind.addon.AddonLaunchCheck
import org.opengrind.addon.AddonGate
import org.opengrind.launchForResult

@InvokeArg
internal class WatchArgs {
    lateinit var onEvent: Channel
}

@TauriPlugin
class GoogleOauthPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun getToken(invoke: Invoke) {
        try {
            val intent = Intent(REQUEST_TOKEN_ACTION).setPackage(COMPANION_PACKAGE)
            when (AddonLaunchCheck.decide(activity, intent, COMPANION_PACKAGE)) {
                AddonGate.Verdict.Launch -> activity.launchForResult(intent) { tokenResult(invoke, it) }
                AddonGate.Verdict.Unavailable -> invoke.reject(ERROR_UNAVAILABLE)
                AddonGate.Verdict.Disabled -> invoke.reject(ERROR_DISABLED)
                AddonGate.Verdict.Untrusted -> invoke.reject(ERROR_UNTRUSTED)
                AddonGate.Verdict.Hidden -> invoke.reject(ERROR_UNAVAILABLE)
                AddonGate.Verdict.TurnedOff -> invoke.reject(ERROR_UNAVAILABLE)
                AddonGate.Verdict.Outdated -> invoke.reject(ERROR_UNAVAILABLE)
            }
        } catch (e: SecurityException) {
            invoke.reject(ERROR_REFUSED)
        } catch (e: Exception) {
            invoke.reject(ERROR_UNAVAILABLE)
        }
    }

    @Command
    fun watchHandoff(invoke: Invoke) {
        HandoffEvents.listen(invoke.parseArgs(WatchArgs::class.java).onEvent)
        invoke.resolve()
    }

    @Command
    fun handoffPending(invoke: Invoke) {
        invoke.resolve(
            JSObject().apply {
                put("pending", TokenHandoff.pending(SystemClock.elapsedRealtime()))
            }
        )
    }

    @Command
    fun takeHandoff(invoke: Invoke) {
        val token = TokenHandoff.take(SystemClock.elapsedRealtime())
        invoke.resolve(JSObject().apply { put("token", token) })
    }

    @Command
    fun discardHandoff(invoke: Invoke) {
        TokenHandoff.clear()
        invoke.resolve()
    }

    override fun onNewIntent(intent: Intent) {
        if (TokenHandoff.pending(SystemClock.elapsedRealtime())) HandoffEvents.notifyPending()
    }

    private fun tokenResult(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_OK) {
            val token = result.data?.getStringExtra(EXTRA_TOKEN)
            if (token.isNullOrEmpty()) {
                invoke.reject(ERROR_NO_TOKEN)
            } else {
                invoke.resolve(JSObject().apply { put("token", token) })
            }
        } else if (result.resultCode == RESULT_REFUSED) {
            invoke.reject(ERROR_REFUSED)
        } else {
            invoke.reject(ERROR_CANCELLED)
        }
    }

    private companion object {
        const val COMPANION_PACKAGE = "org.opengrind.google_oauth"
        const val REQUEST_TOKEN_ACTION = "org.opengrind.google_oauth.action.REQUEST_TOKEN"
        const val EXTRA_TOKEN = "org.opengrind.google_oauth.extra.TOKEN"
        const val RESULT_REFUSED = Activity.RESULT_FIRST_USER

        const val ERROR_UNAVAILABLE = "companion-unavailable"
        const val ERROR_UNTRUSTED = "companion-untrusted"
        const val ERROR_REFUSED = "companion-refused"
        const val ERROR_DISABLED = "companion-disabled"
        const val ERROR_CANCELLED = "cancelled"
        const val ERROR_NO_TOKEN = "no-token"
    }
}
