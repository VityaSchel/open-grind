package org.opengrind.push.relay

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RelayConfigTest {
	private val endpoint = "https://push.example.net/wpush/v2/abc123"
	private val p256dh = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-" +
		"AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
	private val auth = "BTBZMqHH6r4Tts7J_aSIgg"
	private val vapid = "iAzcyW-1VPVkQ76lLNwI0M0RzSiVktuXmy2n0nMVNEk"

	private fun parsed(bytes: ByteArray) = JSONObject(String(bytes, Charsets.UTF_8))

	private fun config(url: String) = RelayConfig.json(url, p256dh, auth, vapid)

	private fun expectedConfig(escapedEndpoint: String) =
		"""{"endpoint":"$escapedEndpoint","keys":{"p256dh":"$p256dh","auth":"$auth"},"vapid":"$vapid"}"""

	@Test
	fun `the config has exactly the endpoint, the keys and the vapid fields`() {
		val config = parsed(config(endpoint))
		assertEquals(setOf("endpoint", "keys", "vapid"), config.keySet())
		assertEquals(endpoint, config.get("endpoint"))
		assertEquals(vapid, config.get("vapid"))
		val keys = config.getJSONObject("keys")
		assertEquals(setOf("p256dh", "auth"), keys.keySet())
		assertEquals(p256dh, keys.get("p256dh"))
		assertEquals(auth, keys.get("auth"))
	}

	@Test
	fun `the config bytes keep the endpoint verbatim, slashes, query and plain http included`() {
		val urls = listOf(
			endpoint,
			"https://ntfy.example.net/upAbC?up=1",
			"http://192.168.1.2:8080/UP?x=a%2Fb&y=1",
		)
		for (url in urls) {
			assertEquals(expectedConfig(url), String(config(url), Charsets.UTF_8))
		}
	}

	@Test
	fun `a quote and a backslash in the endpoint are the only characters escaped`() {
		val url = "https://ntfy.example.net/up\"Ab\\C?up=1"
		val escaped = """https://ntfy.example.net/up\"Ab\\C?up=1"""
		assertEquals(expectedConfig(escaped), String(config(url), Charsets.UTF_8))
		assertEquals(url, parsed(config(url)).getString("endpoint"))
	}

	@Test
	fun `non-ASCII endpoint characters are written as UTF-8 bytes, not escapes`() {
		val url = "https://push.example.net/café/" + 0x2028.toChar()
		val expected = expectedConfig(url).toByteArray(Charsets.UTF_8)
		assertArrayEquals(expected, config(url))
		assertEquals(url, parsed(config(url)).getString("endpoint"))
	}

	@Test
	fun `the config is compact UTF-8 without a byte order mark`() {
		val bytes = config("https://push.example.net/é")
		assertEquals('{'.code.toByte(), bytes[0])
		assertEquals('}'.code.toByte(), bytes.last())
		val text = String(bytes, Charsets.UTF_8)
		assertTrue(text.toByteArray(Charsets.UTF_8).contentEquals(bytes))
		assertFalse(text.contains('\n'))
		assertFalse(text.contains(' '))
		assertTrue(text.contains("é"))
	}
}
