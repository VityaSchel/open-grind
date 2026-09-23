package org.opengrind.push

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationPermissionTest {
	private fun state(sdk: Int, permitted: Boolean, pluginState: String?) =
		NotificationPermission.stateOf(sdk = sdk, permitted = permitted, pluginState = pluginState)

	@Test
	fun `a permitted app is granted whatever the plugin reports`() {
		for (sdk in listOf(26, 32, 33, 36)) {
			for (pluginState in listOf(null, "granted", "denied", "prompt", "prompt-with-rationale")) {
				assertEquals("granted", state(sdk = sdk, permitted = true, pluginState = pluginState))
			}
		}
	}

	@Test
	fun `below Android 13 a blocked app is denied because there is no runtime prompt`() {
		for (sdk in listOf(26, 32)) {
			for (pluginState in listOf(null, "granted", "prompt", "prompt-with-rationale")) {
				assertEquals("denied", state(sdk = sdk, permitted = false, pluginState = pluginState))
			}
		}
	}

	@Test
	fun `a missing plugin state is denied`() {
		assertEquals("denied", state(sdk = 33, permitted = false, pluginState = null))
	}

	@Test
	fun `a plugin grant contradicted by the system is denied`() {
		assertEquals("denied", state(sdk = 33, permitted = false, pluginState = "granted"))
	}

	@Test
	fun `from Android 13 a promptable state passes through`() {
		for (pluginState in listOf("denied", "prompt", "prompt-with-rationale")) {
			assertEquals(pluginState, state(sdk = 33, permitted = false, pluginState = pluginState))
			assertEquals(pluginState, state(sdk = 36, permitted = false, pluginState = pluginState))
		}
	}
}
