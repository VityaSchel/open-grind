package org.opengrind.push

object NotificationPermission {
	const val GRANTED = "granted"
	const val DENIED = "denied"

	private const val RUNTIME_PERMISSION_SDK = 33

	fun stateOf(sdk: Int, permitted: Boolean, pluginState: String?): String = when {
		permitted -> GRANTED
		sdk < RUNTIME_PERMISSION_SDK -> DENIED
		pluginState == null || pluginState == GRANTED -> DENIED
		else -> pluginState
	}
}
