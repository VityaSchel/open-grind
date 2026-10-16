package org.opengrind.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WatermarkTest {
	private val deviceNow = 1_700_000_000_000L

	@Test
	fun `leaving the app marks everything up to the skew allowance as seen`() {
		assertEquals(Watermark(deviceNow - Watermark.CLOCK_SKEW_ALLOWANCE_MS), Watermark.seenAt(deviceNow))
	}

	@Test
	fun `a device clock running ahead of grindr still announces what arrives after leaving`() {
		val serverBehindBy = 90_000L
		val arrivedAfterLeaving = deviceNow - serverBehindBy + 1_000L
		assertFalse(Watermark.seenAt(deviceNow).covers(arrivedAfterLeaving))
	}

	@Test
	fun `seeding fills only a watermark that was never armed`() {
		val from = Watermark(500L)
		assertEquals(from, Watermark.Unarmed.seeded(from))
		assertEquals(Watermark(100L), Watermark(100L).seeded(from))
	}

	@Test
	fun `advancing never moves the watermark backwards`() {
		assertEquals(Watermark(900L), Watermark(900L).newest(Watermark(300L)))
		assertEquals(Watermark(400L), Watermark(100L).newest(Watermark(400L)))
	}

	@Test
	fun `a watermark covers what arrived up to and including it`() {
		val seen = Watermark(900L)
		assertTrue(seen.covers(900L))
		assertTrue(seen.covers(500L))
		assertFalse(seen.covers(901L))
	}

	@Test
	fun `an unarmed watermark covers nothing`() {
		assertFalse(Watermark.Unarmed.covers(1L))
	}
}
