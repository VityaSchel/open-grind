package org.opengrind.push

import app.tauri.plugin.Channel
import app.tauri.plugin.JSObject

object PushEvents {
	private var sink: Channel? = null
	private var pendingDeeplink: String? = null

	@Synchronized
	fun listen(channel: Channel) {
		sink = channel
	}

	@Synchronized
	fun offerDeeplink(deeplink: String) {
		pendingDeeplink = deeplink
		send(deeplinkPending = true, tokenChanged = false)
	}

	@Synchronized
	fun takeDeeplink(): String? = pendingDeeplink.also { pendingDeeplink = null }

	@Synchronized
	fun notifyTokenChanged() {
		send(deeplinkPending = false, tokenChanged = true)
	}

	private fun send(deeplinkPending: Boolean, tokenChanged: Boolean) {
		sink?.send(
			JSObject().apply {
				put("deeplinkPending", deeplinkPending)
				put("tokenChanged", tokenChanged)
			},
		)
	}
}
