package org.opengrind.push

enum class FastSource(val wire: String) {
	Addon("addon"),
	Relay("relay"),
	;

	companion object {
		fun of(wire: String?): FastSource? = entries.firstOrNull { it.wire == wire }
	}
}

fun migratedFastSource(mode: PushMode, addonInstalled: Boolean): FastSource? =
	if (mode == PushMode.Fast || addonInstalled) FastSource.Addon else null
