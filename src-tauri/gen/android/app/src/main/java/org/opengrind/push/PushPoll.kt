package org.opengrind.push

import org.json.JSONArray
import org.json.JSONObject

object PushPoll {
	init {
		System.loadLibrary("open_grind_lib")
	}

	external fun nativePoll(sinceInbox: Long, shownConversations: String): String?

	fun since(watermark: Watermark, shown: List<ShownConversation>): Poll {
		val nothing = Poll(watermark, emptyList())
		val answer = runCatching {
			nativePoll(
				sinceInbox = watermark.at,
				shownConversations = encode(shown),
			)
		}.getOrNull() ?: return nothing
		return runCatching { parse(answer) }.getOrDefault(nothing)
	}

	private fun parse(answer: String): Poll {
		val root = JSONObject(answer)
		val pushes = root.getJSONArray("pushes")
		val payloads = (0 until pushes.length()).mapNotNull { index ->
			pushes.optJSONObject(index)?.let { push ->
				push.keys().asSequence().associateWith { key -> push.optString(key) }
			}
		}
		return Poll(Watermark(root.getLong("inboxWatermark")), payloads)
	}

	private fun encode(shown: List<ShownConversation>): String =
		JSONArray(
			shown.map { conversation ->
				JSONObject()
					.put("conversationId", conversation.conversationId)
					.put("keys", JSONArray(conversation.keys))
			},
		).toString()

	data class Poll(val watermark: Watermark, val payloads: List<Map<String, String>>)

	data class ShownConversation(val conversationId: String, val keys: List<String>)
}
