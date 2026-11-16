package org.opengrind.push.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class EndpointDigestTest {
	private val endpoint = "https://push.example.net/wpush/v2/abc123"
	private val p256dh = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-" +
		"AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
	private val auth = "BTBZMqHH6r4Tts7J_aSIgg"

	@Test
	fun `the digest is the hex SHA-256 of the url, the p256dh and the auth joined by NUL bytes`() {
		assertEquals(
			"b10cef8a1cbc399f15838458caacb76f049a4e8cc9f5fc8adae92ff5beb8f96b",
			EndpointDigest.of(endpoint, p256dh, auth),
		)
		assertEquals(
			"0b7d21f268a086fb71f1b3afdb12cffcb5d8498d61f2e0f2adff675de4a63a31",
			EndpointDigest.of("https://ntfy.example.net/upAbC?up=1", "p", "a"),
		)
	}

	@Test
	fun `moving a character across a separator changes the digest`() {
		assertNotEquals(EndpointDigest.of("ab", "c", "d"), EndpointDigest.of("a", "bc", "d"))
		assertNotEquals(EndpointDigest.of("a", "bc", "d"), EndpointDigest.of("a", "b", "cd"))
	}

	@Test
	fun `a changed url, p256dh or auth changes the digest`() {
		val digest = EndpointDigest.of(endpoint, p256dh, auth)
		assertNotEquals(digest, EndpointDigest.of("$endpoint?up=1", p256dh, auth))
		assertNotEquals(digest, EndpointDigest.of(endpoint, p256dh.replaceFirst('B', 'C'), auth))
		assertNotEquals(digest, EndpointDigest.of(endpoint, p256dh, auth.replaceFirst('B', 'C')))
	}
}
