package org.opengrind.push.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ResyncTsTest {
	private val now = 1793000000L

	private fun accepted(ts: Long, lastTs: Long, nowSeconds: Long) =
		ts > clampedResyncTs(lastTs, nowSeconds)

	@Test
	fun `a ts past the skew window is clamped to one hour past the phone clock`() {
		assertEquals(now + 3600, clampedResyncTs(now + 86400, now))
		assertEquals(now + 3600, clampedResyncTs(now + 3601, now))
	}

	@Test
	fun `a current, past or in-window ts is unchanged`() {
		for (ts in listOf(now, now - 86400, now + 60, now + 3600)) {
			assertEquals(ts, clampedResyncTs(ts, now))
		}
	}

	@Test
	fun `a relay ahead of the phone by a constant offset still advances on every resync`() {
		val offset = 2 * 86400L
		var lastTs = clampedResyncTs(now + offset, now)
		for (phoneTime in listOf(now + 1, now + 60, now + 3600, now + 86400)) {
			val ts = phoneTime + offset
			assertTrue(accepted(ts, lastTs, phoneTime))
			val stored = clampedResyncTs(ts, phoneTime)
			assertTrue(stored > lastTs)
			lastTs = stored
		}
	}

	@Test
	fun `a future-dated resync holds back current ones no longer than the skew window`() {
		val lastTs = clampedResyncTs(now + 30 * 86400L, now)
		assertFalse(accepted(now + 60, lastTs, now + 60))
		assertTrue(accepted(now + 3601, lastTs, now + 3601))
	}

	@Test
	fun `a replayed or older resync is still refused while both clocks agree`() {
		val lastTs = clampedResyncTs(now, now)
		assertFalse(accepted(now, lastTs, now + 10))
		assertFalse(accepted(now - 1, lastTs, now + 10))
		assertTrue(accepted(now + 10, lastTs, now + 10))
	}
}
