package org.opengrind.push

data class Watermarks(val inbox: Long, val taps: Long) {
	fun seeded(from: Watermarks) = Watermarks(
		inbox = if (inbox == 0L) from.inbox else inbox,
		taps = if (taps == 0L) from.taps else taps,
	)

	fun newest(other: Watermarks) = Watermarks(
		inbox = maxOf(inbox, other.inbox),
		taps = maxOf(taps, other.taps),
	)

	fun covers(kind: PushKind, at: Long): Boolean = at <= when (kind) {
		PushKind.Message -> inbox
		PushKind.Tap -> taps
	}

	companion object {
		const val CLOCK_SKEW_ALLOWANCE_MS = 2L * 60L * 1000L

		val Unarmed = Watermarks(inbox = 0L, taps = 0L)

		fun seenAt(deviceTime: Long): Watermarks =
			(deviceTime - CLOCK_SKEW_ALLOWANCE_MS).let { Watermarks(inbox = it, taps = it) }
	}
}
