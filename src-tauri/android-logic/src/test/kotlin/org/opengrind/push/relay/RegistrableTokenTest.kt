package org.opengrind.push.relay

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RegistrableTokenTest {
	@Test
	fun `a firebase token with an installation id before the colon is registrable`() {
		assertTrue(isRegistrableToken("fEJ0SZYSQm-bC1Zq:APA91bHqR-3xY_0"))
		assertTrue(isRegistrableToken("a:b"))
	}

	@Test
	fun `colons after the first belong to the rest of the token`() {
		assertTrue(isRegistrableToken("fid:APA91b:extra"))
		assertTrue(isRegistrableToken("fid::"))
	}

	@Test
	fun `a token without an id, without a rest or without a colon is not registrable`() {
		for (token in listOf("", ":", "fid", ":APA91bX", "fid:")) {
			assertFalse(token, isRegistrableToken(token))
		}
	}

	@Test
	fun `a token with spaces, control characters or non-ASCII characters is not registrable`() {
		val tokens = listOf(
			"fid :x",
			"fid: x",
			"fid:x ",
			"fid:x\n",
			"fid:x\t",
			"fid:\u007f",
			"fid:x\u0000",
			"fid:é",
			"ﬁd:x",
		)
		for (token in tokens) {
			assertFalse(token, isRegistrableToken(token))
		}
	}
}
