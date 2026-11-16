package org.opengrind.push.relay

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class CompactJsonTest {
	private fun unicodeEscape(digits: String) = "\\" + "u" + digits

	@Test
	fun `a quote and a backslash are escaped with a backslash`() {
		assertEquals(""""a\"b\\c"""", CompactJson.string("a\"b\\c"))
	}

	@Test
	fun `control characters are written as four-digit lowercase unicode escapes`() {
		val controls = String(charArrayOf(0x00.toChar(), 0x0A.toChar(), 0x1F.toChar()))
		val escaped = listOf("0000", "000a", "001f").joinToString("") { unicodeEscape(it) }
		assertEquals("\"$escaped\"", CompactJson.string(controls))
	}

	@Test
	fun `slashes, DEL and non-ASCII characters are written as they are, in UTF-8`() {
		val value = "a/b" + 0x7F.toChar() + "é" + 0x2028.toChar() + String(Character.toChars(0x1F600))
		val expected = "\"$value\"".toByteArray(Charsets.UTF_8)
		assertArrayEquals(expected, CompactJson.string(value).toByteArray(Charsets.UTF_8))
	}

	@Test
	fun `an object joins its members in order without whitespace`() {
		val json = CompactJson.objectOf("b" to CompactJson.string("1"), "a" to "{}")
		assertEquals("""{"b":"1","a":{}}""", json)
	}

	@Test
	fun `every escaped string parses back to the original`() {
		val value = (0 until 0x80).map { it.toChar() }.joinToString("") + "é" + 0x2028.toChar()
		val parsed = JSONObject(CompactJson.objectOf("value" to CompactJson.string(value)))
		assertEquals(value, parsed.getString("value"))
	}
}
