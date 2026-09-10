package org.opengrind.facebookoauth

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.opengrind.FacebookOauthActivity

@TauriPlugin
class FacebookOauthPlugin(private val activity: Activity) : Plugin(activity) {

	@Command
	fun dismiss(invoke: Invoke) {
		FacebookOauthActivity.dismiss()
		invoke.resolve(JSObject())
	}

	@Command
	fun clearProfile(invoke: Invoke) {
		FacebookOauthActivity.clearIsolatedProfile()
		invoke.resolve(JSObject())
	}
}
