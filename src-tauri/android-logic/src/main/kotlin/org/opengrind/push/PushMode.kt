package org.opengrind.push

enum class PushMode(val wire: String) {
	Slow("slow"),
	Fast("fast"),
	;

	companion object {
		fun of(wire: String?): PushMode = entries.firstOrNull { it.wire == wire } ?: Slow
	}
}
