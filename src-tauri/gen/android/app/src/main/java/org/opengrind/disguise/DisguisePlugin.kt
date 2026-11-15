package org.opengrind.disguise

import android.app.Activity
import androidx.core.app.NotificationManagerCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
internal class SelectArgs {
	lateinit var id: String
}

@TauriPlugin
class DisguisePlugin(private val activity: Activity) : Plugin(activity) {

	@Command
	fun current(invoke: Invoke) {
		invoke.resolve(JSObject().apply { put("id", Disguise.current(activity).id) })
	}

	@Command
	fun select(invoke: Invoke) {
		val id = invoke.parseArgs(SelectArgs::class.java).id
		if (Disguise.current(activity).id == id) {
			invoke.resolve()
			return
		}
		try {
			Disguise.select(activity, id)
		} catch (error: IllegalArgumentException) {
			invoke.reject(error.message)
			return
		}
		NotificationManagerCompat.from(activity).cancelAll()
		invoke.resolve()
		activity.window.decorView.postDelayed({
			RestartActivity.restart(activity, Disguise.launchIntent(activity))
		}, RELAUNCH_DELAY_MS)
	}

	private companion object {
		const val RELAUNCH_DELAY_MS = 500L
	}
}
