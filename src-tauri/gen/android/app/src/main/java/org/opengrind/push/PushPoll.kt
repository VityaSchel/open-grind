package org.opengrind.push

import org.json.JSONObject

object PushPoll {
	init {
		System.loadLibrary("open_grind_lib")
	}

	external fun nativePoll(sinceInbox: Long, sinceTaps: Long): String?

	fun since(watermarks: Watermarks): Poll {
		val nothing = Poll(watermarks, emptyList())
		val answer = runCatching {
			nativePoll(sinceInbox = watermarks.inbox, sinceTaps = watermarks.taps)
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

	data class Poll(val watermarks: Watermarks, val payloads: List<Map<String, String>>)
}
