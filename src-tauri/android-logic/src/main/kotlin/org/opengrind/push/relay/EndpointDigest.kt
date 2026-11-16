package org.opengrind.push.relay

import java.security.MessageDigest

object EndpointDigest {
	private const val SEPARATOR: Byte = 0x00

	fun of(url: String, p256dh: String, auth: String): String {
		val digest = MessageDigest.getInstance("SHA-256")
		digest.update(url.toByteArray(Charsets.UTF_8))
		digest.update(SEPARATOR)
		digest.update(p256dh.toByteArray(Charsets.UTF_8))
		digest.update(SEPARATOR)
		digest.update(auth.toByteArray(Charsets.UTF_8))
		return Hex.encode(digest.digest())
	}
}
