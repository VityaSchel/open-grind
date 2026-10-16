package org.opengrind.push

data class Watermark(val at: Long) {
	fun seeded(from: Watermark) = if (at == 0L) from else this

	fun newest(other: Watermark) = Watermark(maxOf(at, other.at))

	fun covers(arrivedAt: Long): Boolean = arrivedAt <= at

	companion object {
		const val CLOCK_SKEW_ALLOWANCE_MS = 2L * 60L * 1000L

		val Unarmed = Watermark(0L)

		fun seenAt(deviceTime: Long) = Watermark(deviceTime - CLOCK_SKEW_ALLOWANCE_MS)
	}
}
