package org.opengrind.push

import org.json.JSONObject

object PushPoll {
	init {
		System.loadLibrary("open_grind_lib")
	}

	external fun nativePoll(since: Long): String?

	fun since(watermark: Long): Poll {
		val answer = runCatching { nativePoll(watermark) }.getOrNull()
			?: return Poll(watermark, emptyList())
		return runCatching { parse(answer, watermark) }
			.getOrDefault(Poll(watermark, emptyList()))
	}

	private fun parse(answer: String, watermark: Long): Poll {
		val root = JSONObject(answer)
		val pushes = root.optJSONArray("pushes") ?: return Poll(watermark, emptyList())
		val payloads = (0 until pushes.length()).mapNotNull { index ->
			pushes.optJSONObject(index)?.let { push ->
				push.keys().asSequence().associateWith { key -> push.optString(key) }
			}
		}
		return Poll(root.optLong("watermark", watermark), payloads)
	}

	data class Poll(val watermark: Long, val payloads: List<Map<String, String>>)
}
