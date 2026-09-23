package org.opengrind.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WatermarksTest {
	private val deviceNow = 1_700_000_000_000L

	@Test
	fun `leaving the app marks everything up to the skew allowance as seen`() {
		val seen = Watermarks.seenAt(deviceNow)
		val expected = deviceNow - Watermarks.CLOCK_SKEW_ALLOWANCE_MS
		assertEquals(Watermarks(inbox = expected, taps = expected), seen)
	}

	@Test
	fun `a device clock running ahead of grindr still announces what arrives after leaving`() {
		val serverBehindBy = 90_000L
		val arrivedAfterLeaving = deviceNow - serverBehindBy + 1_000L
		val seen = Watermarks.seenAt(deviceNow)
		assertTrue(arrivedAfterLeaving > seen.inbox)
		assertTrue(arrivedAfterLeaving > seen.taps)
	}

	@Test
	fun `seeding fills only the watermarks that were never armed`() {
		val from = Watermarks(inbox = 500L, taps = 600L)
		assertEquals(from, Watermarks.Unarmed.seeded(from))
		assertEquals(Watermarks(inbox = 100L, taps = 600L), Watermarks(inbox = 100L, taps = 0L).seeded(from))
		assertEquals(Watermarks(inbox = 100L, taps = 200L), Watermarks(inbox = 100L, taps = 200L).seeded(from))
	}

	@Test
	fun `advancing never moves a watermark backwards`() {
		val stored = Watermarks(inbox = 900L, taps = 100L)
		assertEquals(Watermarks(inbox = 900L, taps = 400L), stored.newest(Watermarks(inbox = 300L, taps = 400L)))
	}

	@Test
	fun `a watermark covers what arrived up to and including it, per kind`() {
		val seen = Watermarks(inbox = 900L, taps = 100L)
		assertTrue(seen.covers(PushKind.Message, 900L))
		assertTrue(seen.covers(PushKind.Message, 500L))
		assertFalse(seen.covers(PushKind.Message, 901L))
		assertTrue(seen.covers(PushKind.Tap, 100L))
		assertFalse(seen.covers(PushKind.Tap, 500L))
	}

	@Test
	fun `an unarmed watermark covers nothing`() {
		assertFalse(Watermarks.Unarmed.covers(PushKind.Message, 1L))
		assertFalse(Watermarks.Unarmed.covers(PushKind.Tap, 1L))
	}
}
