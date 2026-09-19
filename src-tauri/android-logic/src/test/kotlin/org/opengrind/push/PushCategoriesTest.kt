package org.opengrind.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PushCategoriesTest {
	@Test
	fun `every kind has a wire name and round-trips`() {
		for (kind in PushKind.entries) {
			assertEquals(kind, PushCategories.kindOf(PushCategories.wireOf(kind)))
		}
	}

	@Test
	fun `wire names are stable, because they key a stored preference`() {
		assertEquals("messages", PushCategories.wireOf(PushKind.Message))
		assertEquals("taps", PushCategories.wireOf(PushKind.Tap))
	}

	@Test
	fun `an unknown wire name is not a category`() {
		assertNull(PushCategories.kindOf("albums"))
	}
}
