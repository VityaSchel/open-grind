package org.opengrind.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FastSourceTest {
	@Test
	fun `the wire names match the Rust and TypeScript values`() {
		assertEquals("addon", FastSource.Addon.wire)
		assertEquals("relay", FastSource.Relay.wire)
	}

	@Test
	fun `every source round-trips through its wire name`() {
		for (source in FastSource.entries) {
			assertEquals(source, FastSource.of(source.wire))
		}
	}

	@Test
	fun `a missing or unknown stored source means Fast Mode is unconfigured`() {
		for (wire in listOf(null, "", "Addon", "RELAY", "fcm", "unifiedpush")) {
			assertNull(wire, FastSource.of(wire))
		}
	}

	@Test
	fun `an install already in Fast Mode migrates to the add-on`() {
		assertEquals(FastSource.Addon, migratedFastSource(PushMode.Fast, addonInstalled = false))
		assertEquals(FastSource.Addon, migratedFastSource(PushMode.Fast, addonInstalled = true))
	}

	@Test
	fun `an install with the add-on present migrates to the add-on even in Slow Mode`() {
		assertEquals(FastSource.Addon, migratedFastSource(PushMode.Slow, addonInstalled = true))
	}

	@Test
	fun `an install in Slow Mode without the add-on stays unconfigured`() {
		assertNull(migratedFastSource(PushMode.Slow, addonInstalled = false))
	}
}
