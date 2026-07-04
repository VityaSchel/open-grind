package org.opengrind.googleoauth

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class GoogleOauthPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun getToken(invoke: Invoke) {
        try {
            val intent = Intent(REQUEST_TOKEN_ACTION).setPackage(COMPANION_PACKAGE)
            if (intent.resolveActivity(activity.packageManager) == null) {
                invoke.reject(ERROR_UNAVAILABLE)
                return
            }
            startActivityForResult(invoke, intent, "tokenResult")
        } catch (e: Exception) {
            // Companion missing or refused the launch (e.g. signature mismatch).
            invoke.reject(ERROR_UNAVAILABLE)
        }
    }

    @ActivityCallback
    fun tokenResult(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_OK) {
            val token = result.data?.getStringExtra(EXTRA_TOKEN)
            if (token.isNullOrEmpty()) {
                invoke.reject(ERROR_NO_TOKEN)
            } else {
                invoke.resolve(JSObject().apply { put("token", token) })
            }
        } else {
            invoke.reject(ERROR_CANCELLED)
        }
    }

    private companion object {
        const val COMPANION_PACKAGE = "org.opengrind.google_oauth"
        const val REQUEST_TOKEN_ACTION = "org.opengrind.google_oauth.action.REQUEST_TOKEN"
        const val EXTRA_TOKEN = "org.opengrind.google_oauth.extra.TOKEN"

        const val ERROR_UNAVAILABLE = "companion-unavailable"
        const val ERROR_CANCELLED = "cancelled"
        const val ERROR_NO_TOKEN = "no-token"
    }
}
