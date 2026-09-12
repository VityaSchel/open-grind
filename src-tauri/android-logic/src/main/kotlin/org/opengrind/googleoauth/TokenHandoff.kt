package org.opengrind.googleoauth

import java.util.concurrent.atomic.AtomicReference

object TokenHandoff {
	const val TTL_MILLIS = 5L * 60 * 1000

	private data class Stashed(val token: String, val atMillis: Long)

	private val slot = AtomicReference<Stashed?>(null)

	fun offer(token: String, nowMillis: Long) {
		if (token.isEmpty()) return
		slot.set(Stashed(token, nowMillis))
	}

	fun take(nowMillis: Long): String? {
		val found = slot.getAndSet(null) ?: return null
		return if (fresh(found, nowMillis)) found.token else null
	}

	fun pending(nowMillis: Long): Boolean {
		val found = slot.get() ?: return false
		if (fresh(found, nowMillis)) return true
		slot.compareAndSet(found, null)
		return false
	}

	fun clear() {
		slot.set(null)
	}

	private fun fresh(stashed: Stashed, nowMillis: Long): Boolean {
		val age = nowMillis - stashed.atMillis
		return age in 0..TTL_MILLIS
	}
}
