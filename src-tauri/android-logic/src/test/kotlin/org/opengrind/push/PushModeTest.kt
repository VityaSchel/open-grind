package org.opengrind.push

import org.junit.Assert.assertEquals
import org.junit.Test

class PushModeTest {
	@Test
	fun `every mode round-trips through its wire name`() {
		for (mode in PushMode.entries) {
			assertEquals(mode, PushMode.of(mode.wire))
		}
	}

	@Test
	fun `a missing or unknown stored mode falls back to slow, so polling keeps running`() {
		for (wire in listOf(null, "", "FAST", "instant")) {
			assertEquals(PushMode.Slow, PushMode.of(wire))
		}
	}
}
