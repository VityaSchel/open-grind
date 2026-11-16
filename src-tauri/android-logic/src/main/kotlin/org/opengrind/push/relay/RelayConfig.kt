package org.opengrind.push.relay

object RelayConfig {
	fun json(endpoint: String, p256dh: String, auth: String, vapidPrivateKey: String): ByteArray {
		val keys = CompactJson.objectOf(
			"p256dh" to CompactJson.string(p256dh),
			"auth" to CompactJson.string(auth),
		)
		val config = CompactJson.objectOf(
			"endpoint" to CompactJson.string(endpoint),
			"keys" to keys,
			"vapid" to CompactJson.string(vapidPrivateKey),
		)
		return config.toByteArray(Charsets.UTF_8)
	}
}
