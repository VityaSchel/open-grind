package org.opengrind.update

class LiveSession {
	@Volatile
	private var live = NONE

	fun claim(sessionId: Int) {
		live = sessionId
	}

	fun release() {
		live = NONE
	}

	fun isLive(sessionId: Int): Boolean = sessionId != NONE && sessionId == live

	private companion object {
		const val NONE = -1
	}
}
