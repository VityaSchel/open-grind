package org.opengrind.googleoauth

import app.tauri.plugin.Channel
import app.tauri.plugin.JSObject

object HandoffEvents {
	private var sink: Channel? = null

	@Synchronized
	fun listen(channel: Channel) {
		sink = channel
	}

	@Synchronized
	fun notifyPending() {
		sink?.send(JSObject().apply { put("pending", true) })
	}
}
