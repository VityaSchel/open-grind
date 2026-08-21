package org.opengrind.update

import app.tauri.plugin.JSObject

fun InstallOutcome.toJson(): JSObject = JSObject().apply {
	put("succeeded", succeeded)
	put("canceled", canceled)
	put("code", code)
	put("message", message)
}

object InstallEvents {
	private var sink: app.tauri.plugin.Channel? = null

	@Synchronized
	fun listen(channel: app.tauri.plugin.Channel) {
		sink = channel
	}

	@Synchronized
	fun deliver(outcome: InstallOutcome) {
		sink?.send(outcome.toJson())
	}
}
