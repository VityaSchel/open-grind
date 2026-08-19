package org.opengrind.appsettings

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@TauriPlugin
class AppSettingsPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun openAppSettings(invoke: Invoke) {
        val intents = listOf(
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", activity.packageName, null),
            ),
            Intent(Settings.ACTION_SETTINGS),
        )
        for (intent in intents) {
            try {
                activity.startActivity(intent)
                invoke.resolve()
                return
            } catch (_: ActivityNotFoundException) {
            }
        }
        invoke.reject(ERROR_UNAVAILABLE)
    }

    private companion object {
        const val ERROR_UNAVAILABLE = "settings-unavailable"
    }
}
