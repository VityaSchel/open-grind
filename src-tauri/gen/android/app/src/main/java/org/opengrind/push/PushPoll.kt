package org.opengrind.push

import org.json.JSONArray
import org.json.JSONObject

object PushPoll {
	init {
		System.loadLibrary("open_grind_lib")
	}

	external fun nativePoll(sinceInbox: Long, sinceTaps: Long, shownConversations: String): String?

	fun since(watermarks: Watermarks, shown: List<ShownConversation>): Poll {
		val nothing = Poll(watermarks, emptyList())
		val answer = runCatching {
			nativePoll(
				sinceInbox = watermarks.inbox,
				sinceTaps = watermarks.taps,
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
		val watermarks = Watermarks(
			inbox = root.getLong("inboxWatermark"),
			taps = root.getLong("tapsWatermark"),
		)
		return Poll(watermarks, payloads)
	}

	private fun encode(shown: List<ShownConversation>): String =
		JSONArray(
			shown.map { conversation ->
				JSONObject()
					.put("conversationId", conversation.conversationId)
					.put("keys", JSONArray(conversation.keys))
			},
		).toString()

	data class Poll(val watermarks: Watermarks, val payloads: List<Map<String, String>>)

	data class ShownConversation(val conversationId: String, val keys: List<String>)
}
