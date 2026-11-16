package org.opengrind.push.relay

import org.json.JSONObject

sealed interface RelayMessage {
	val ts: Long

	companion object {
		internal fun parse(json: ByteArray): RelayMessage? {
			val root = try {
				JSONObject(String(json, Charsets.UTF_8))
			} catch (e: Exception) {
				return null
			}
			val ts = wholeNumber(root.opt("ts")) ?: return null
			return when (root.opt("type")) {
				"push" -> (root.opt("data") as? JSONObject)?.let { RelayPush(ts, stringEntries(it)) }
				"resync" -> resync(ts, root)
				else -> null
			}
		}

		private fun resync(ts: Long, root: JSONObject): RelayResync? {
			val fcmToken = (root.opt("fcmToken") as? String)
				?.takeIf(::isRegistrableToken)
				?: return null
			val relayKey = (root.opt("relayKey") as? String)?.let(RelayKey::ofHex) ?: return null
			return RelayResync(ts, fcmToken, relayKey)
		}

		private fun wholeNumber(value: Any?): Long? = when (value) {
			is Int -> value.toLong()
			is Long -> value
			else -> null
		}

		private fun stringEntries(data: JSONObject): Map<String, String> = buildMap {
			for (key in data.keys()) {
				val value = data.opt(key) as? String ?: continue
				put(key, value)
			}
		}
	}
}

data class RelayPush(override val ts: Long, val data: Map<String, String>) : RelayMessage

class RelayResync(override val ts: Long, val fcmToken: String, val relayKey: RelayKey) : RelayMessage
