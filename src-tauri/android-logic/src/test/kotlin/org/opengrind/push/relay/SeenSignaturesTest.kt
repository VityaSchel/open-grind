package org.opengrind.push.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SeenSignaturesTest {
	@Test
	fun `a new signature is not repeated and is added as the newest entry`() {
		val seen = SeenSignatures.remember(listOf("a", "b"), "c")
		assertFalse(seen.repeated)
		assertEquals(listOf("a", "b", "c"), seen.ring)
	}

	@Test
	fun `a signature already in the ring is repeated and leaves the ring as it was`() {
		val seen = SeenSignatures.remember(listOf("a", "b", "c"), "a")
		assertTrue(seen.repeated)
		assertEquals(listOf("a", "b", "c"), seen.ring)
	}

	@Test
	fun `the ring keeps only the newest 64 signatures by default`() {
		var ring = emptyList<String>()
		for (index in 0 until 70) {
			ring = SeenSignatures.remember(ring, "sig-$index").ring
		}
		assertEquals(64, ring.size)
		assertEquals("sig-6", ring.first())
		assertEquals("sig-69", ring.last())
		assertFalse(SeenSignatures.remember(ring, "sig-5").repeated)
		assertTrue(SeenSignatures.remember(ring, "sig-6").repeated)
	}

	@Test
	fun `a smaller capacity drops the oldest entries`() {
		val seen = SeenSignatures.remember(listOf("a", "b", "c"), "d", capacity = 2)
		assertEquals(listOf("c", "d"), seen.ring)
	}

	@Test
	fun `a stored ring larger than the capacity is trimmed to its newest entries`() {
		val stored = (0 until 100).map { "sig-$it" }
		assertEquals(stored.takeLast(64), SeenSignatures.remember(stored, "sig-99").ring)
		assertEquals(stored.takeLast(63) + "new", SeenSignatures.remember(stored, "new").ring)
	}
}
