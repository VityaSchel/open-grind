package org.opengrind.push.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RelayMessageTest {
	private val relayKey = RelayFixtures.REFERENCE_PUBLIC

	private fun message(json: String) = RelayFixtures.unsigned(json).message()

	private fun resync(fcmToken: String, key: String = relayKey) =
		message("""{"type":"resync","ts":1793000000,"fcmToken":"$fcmToken","relayKey":"$key"}""")

	@Test
	fun `a push carries its timestamp in seconds and its data`() {
		val expected = RelayPush(1793000000, mapOf("body" to "hey"))
		assertEquals(expected, message(RelayFixtures.PUSH_JSON))
	}

	@Test
	fun `a push with empty data has no entries`() {
		val json = """{"type":"push","ts":1793000000,"data":{}}"""
		assertEquals(RelayPush(1793000000, emptyMap()), message(json))
	}

	@Test
	fun `data values that are not strings are skipped`() {
		val json = """{"type":"push","ts":1,"data":{"title":"Viktor","count":3,"none":null,""" +
			""""flag":true,"nested":{"a":"b"},"list":["x"]}}"""
		assertEquals(RelayPush(1, mapOf("title" to "Viktor")), message(json))
	}

	@Test
	fun `a timestamp beyond the 32-bit range is read whole`() {
		assertEquals(4102444800L, message("""{"type":"push","ts":4102444800,"data":{}}""")?.ts)
	}

	@Test
	fun `unknown fields are ignored`() {
		val json = """{"type":"push","ts":7,"data":{"body":"hey"},"extra":{"x":1},"fcmToken":"f:x"}"""
		assertEquals(RelayPush(7, mapOf("body" to "hey")), message(json))
	}

	@Test
	fun `a resync carries the new token and the relay key it was signed with`() {
		val message = message(RelayFixtures.RESYNC_JSON) as RelayResync
		assertEquals(1793000000L, message.ts)
		assertEquals("fid:APA91bX", message.fcmToken)
		assertEquals(RelayFixtures.referenceKey, message.relayKey)
	}

	@Test
	fun `a resync with an uppercase relay key reads as the same key`() {
		val message = resync("fid:x", relayKey.uppercase()) as RelayResync
		assertEquals(RelayFixtures.referenceKey, message.relayKey)
	}

	@Test
	fun `an unknown or missing type is not a message`() {
		assertNull(message("""{"type":"ping","ts":1,"data":{}}"""))
		assertNull(message("""{"type":"PUSH","ts":1,"data":{}}"""))
		assertNull(message("""{"ts":1,"data":{}}"""))
		assertNull(message("""{"type":1,"ts":1,"data":{}}"""))
	}

	@Test
	fun `malformed JSON is not a message`() {
		val documents = listOf(
			"",
			" ",
			"{",
			"}",
			"null",
			"[]",
			"""["push"]""",
			"\"push\"",
			"""{"type":"push","ts":1,"data":{}""",
			"\u0000",
		)
		for (json in documents) {
			assertNull(json, message(json))
		}
	}

	@Test
	fun `a missing or non-integer timestamp is not a message`() {
		val timestamps = listOf(
			null,
			"\"1793000000\"",
			"1793000000.5",
			"1.7e9",
			"true",
			"null",
			"99999999999999999999",
		)
		for (ts in timestamps) {
			val field = if (ts == null) "" else "\"ts\":$ts,"
			assertNull(ts, message("""{"type":"push",$field"data":{}}"""))
		}
	}

	@Test
	fun `a push without a data object is not a message`() {
		assertNull(message("""{"type":"push","ts":1}"""))
		assertNull(message("""{"type":"push","ts":1,"data":"body"}"""))
		assertNull(message("""{"type":"push","ts":1,"data":null}"""))
		assertNull(message("""{"type":"push","ts":1,"data":[]}"""))
	}

	@Test
	fun `a resync whose token Grindr would not accept is not a message`() {
		val tokens = listOf(
			"",
			"fid",
			":APA91bX",
			"fid:",
			"fid :APA91bX",
			"fid:APA 91",
			"fid:\\u00e9",
			"fid:\\n",
		)
		for (token in tokens) {
			assertNull(token, resync(token))
		}
	}

	@Test
	fun `a resync with a missing or non-string token is not a message`() {
		assertNull(message("""{"type":"resync","ts":1,"relayKey":"$relayKey"}"""))
		assertNull(message("""{"type":"resync","ts":1,"fcmToken":42,"relayKey":"$relayKey"}"""))
	}

	@Test
	fun `a resync with an invalid relay key is not a message`() {
		val offCurve = relayKey.dropLast(1) + if (relayKey.last() == '0') "1" else "0"
		val keys = listOf(
			"",
			relayKey.dropLast(2),
			"02" + relayKey.substring(2, 66),
			offCurve,
			"zz" + relayKey.drop(2),
		)
		for (key in keys) {
			assertNull(key, resync("fid:x", key))
		}
		assertNull(message("""{"type":"resync","ts":1,"fcmToken":"fid:x"}"""))
		assertNull(message("""{"type":"resync","ts":1,"fcmToken":"fid:x","relayKey":7}"""))
	}
}
