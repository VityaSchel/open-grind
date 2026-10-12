package org.opengrind.apporigin

import org.junit.Assert.assertEquals
import org.junit.Test

class MovePlanTest {
	private val legacy = mapOf(
		"open-grind:backdrop-blur" to "high",
		"chat:inbox-last-viewed:42" to "1760000000000",
	)

	@Test
	fun `everything is copied into an empty origin`() {
		assertEquals(legacy, entriesToCopy(legacy, emptyMap()))
	}

	@Test
	fun `a value the new origin already holds is never overwritten`() {
		val current = mapOf("open-grind:backdrop-blur" to "low")

		assertEquals(
			mapOf("chat:inbox-last-viewed:42" to "1760000000000"),
			entriesToCopy(legacy, current),
		)
	}

	@Test
	fun `a key is moved once the new origin holds it under the same name`() {
		val current = mapOf(
			"open-grind:backdrop-blur" to "low",
			"chat:inbox-last-viewed:42" to "1760000000000",
			"unrelated" to "kept",
		)

		assertEquals(legacy.keys, movedKeys(legacy, current))
	}

	@Test
	fun `a copy lost before it reached disk is copied again instead of cleared`() {
		assertEquals(legacy, entriesToCopy(legacy, emptyMap()))
		assertEquals(emptySet<String>(), movedKeys(legacy, emptyMap()))
	}

	@Test
	fun `a key whose copy did not land stays in the legacy origin`() {
		val current = mapOf("open-grind:backdrop-blur" to "high")

		assertEquals(setOf("open-grind:backdrop-blur"), movedKeys(legacy, current))
	}

	@Test
	fun `an empty legacy origin has nothing to move`() {
		assertEquals(emptyMap<String, String>(), entriesToCopy(emptyMap(), legacy))
		assertEquals(emptySet<String>(), movedKeys(emptyMap(), legacy))
	}
}
