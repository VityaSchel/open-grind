package org.opengrind.googleoauth

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TokenHandoffTest {
	@After
	fun reset() {
		TokenHandoff.clear()
	}

	@Test
	fun `a stashed token is taken exactly once`() {
		TokenHandoff.offer("ya29.token", 1_000)

		assertEquals("ya29.token", TokenHandoff.take(1_000))
		assertNull("a second take must not re-deliver", TokenHandoff.take(1_000))
	}

	@Test
	fun `pending does not consume the token`() {
		TokenHandoff.offer("ya29.token", 1_000)

		assertTrue(TokenHandoff.pending(1_000))
		assertTrue(TokenHandoff.pending(1_000))
		assertEquals("ya29.token", TokenHandoff.take(1_000))
	}

	@Test
	fun `an expired token is dropped rather than delivered`() {
		TokenHandoff.offer("ya29.token", 0)

		assertFalse(TokenHandoff.pending(TokenHandoff.TTL_MILLIS + 1))
		assertNull(TokenHandoff.take(TokenHandoff.TTL_MILLIS + 1))
	}

	@Test
	fun `a token exactly at the ttl boundary is still delivered`() {
		TokenHandoff.offer("ya29.token", 0)

		assertEquals("ya29.token", TokenHandoff.take(TokenHandoff.TTL_MILLIS))
	}

	@Test
	fun `a clock that runs backwards drops the token instead of extending it`() {
		TokenHandoff.offer("ya29.token", 10_000)

		assertFalse(TokenHandoff.pending(9_000))
		assertNull(TokenHandoff.take(9_000))
	}

	@Test
	fun `an empty token is never stashed`() {
		TokenHandoff.offer("", 1_000)

		assertFalse(TokenHandoff.pending(1_000))
		assertNull(TokenHandoff.take(1_000))
	}

	@Test
	fun `a second offer replaces the first`() {
		TokenHandoff.offer("ya29.first", 1_000)
		TokenHandoff.offer("ya29.second", 2_000)

		assertEquals("ya29.second", TokenHandoff.take(2_000))
	}

	@Test
	fun `clear drops a stashed token`() {
		TokenHandoff.offer("ya29.token", 1_000)
		TokenHandoff.clear()

		assertFalse(TokenHandoff.pending(1_000))
	}
}
