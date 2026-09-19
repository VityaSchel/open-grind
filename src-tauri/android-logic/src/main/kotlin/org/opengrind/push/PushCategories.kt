package org.opengrind.push

object PushCategories {
	fun wireOf(kind: PushKind): String = when (kind) {
		PushKind.Message -> "messages"
		PushKind.Tap -> "taps"
	}

	fun kindOf(wire: String): PushKind? =
		PushKind.entries.firstOrNull { kind -> wireOf(kind) == wire }
}
