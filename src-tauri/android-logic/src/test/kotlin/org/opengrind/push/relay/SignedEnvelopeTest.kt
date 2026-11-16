package org.opengrind.push.relay

import java.security.Signature
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SignedEnvelopeTest {
	private val reference = RelayFixtures.referenceKey
	private val pushSignature = "8639a403579a14449dc091aaf049f2d67ee4257aed709c56304b49ba3496b80c" +
		"c1fa54b1e08d766215eab0da9302de593167c45852c62f66be77320202e2229a"
	private val resyncSignature = "e82bc3281ded233295ff9ade775cec8cf541f1abb76bcb898247e2da282ddf8e" +
		"25909b3c1978910885ee71acfad967a91592c81a850260074ec426318792c983"
	private val rLeadingZero = "002344e55b273f9deaf876aa44d33754527e8cf521004be8280d1e7216ac865f" +
		"631a54ae6461088eb10e7095eb96ba9b25ec7cc22ed2df52067271757716c3e5"
	private val sLeadingZero = "47b19bbc16fce426c4ff1dc9718a68311329b92c00241fcc0525c97235ebf05a" +
		"002c743da4e04e645fcf1166515fbf1c308a47effc5af8eeaee100ffa3d6625c"
	private val rZeroThenHighByte = "00abb63bd6539897523655b9debd38a6aa58c13f5cf04589ba17af036fd6a8f7" +
		"017f62c5ddf09bb9875b6310001eda0e59b6983f2fcb50ab8f22c42b719dc5c5"
	private val sZeroThenHighByte = "a49110620dacc5f5235435eca3155c4b1df96ada323300d33b657576bf13f543" +
		"00a208b2ab700256c0a573645ddc200b63b6f341495b0e0f63105cafc3ccfc5e"
	private val rTwoLeadingZeros = "0000b7c92ca98c5fa75291f3d23048ce9a35ad5c1fb09a294ba54b8f8d2c515e" +
		"7a06f27acbd20b526e73556d37419a7685ff6b357580f000bc00a66f9baff589"
	private val goEscapedPushJson = """{"type":"push","ts":1793000000,"data":{"body":"\u003c3 \u0026 \u2028 é"}}"""
	private val goEscapedPushJsonHex = "7b2274797065223a2270757368222c227473223a313739333030303030302c" +
		"2264617461223a7b22626f6479223a225c753030336333205c7530303236205c753230323820c3a9227d7d"
	private val goEscapedPushSignature = "d81069996c57fa14ccf4dd2383399d51088b2761c83886d7e94a7ffc7f060c24" +
		"0e0c8561ef3e6b43965b6b73f5f9568762da3ccd9f66438f999524c317679520"
	private val decodedBody = "<3 & \u2028 é"

	private fun push(signatureHex: String) =
		RelayFixtures.envelope(RelayFixtures.PUSH_JSON, signatureHex)

	@Test
	fun `the reference push envelope verifies under the relay key`() {
		assertTrue(push(pushSignature).verifiedBy(reference))
	}

	@Test
	fun `the reference resync envelope verifies under the relay key`() {
		val envelope = RelayFixtures.envelope(RelayFixtures.RESYNC_JSON, resyncSignature)
		assertTrue(envelope.verifiedBy(reference))
	}

	@Test
	fun `an r with a leading zero byte is shortened to minimal DER and verifies`() {
		assertTrue(push(rLeadingZero).verifiedBy(reference))
	}

	@Test
	fun `an s with a leading zero byte is shortened to minimal DER and verifies`() {
		assertTrue(push(sLeadingZero).verifiedBy(reference))
	}

	@Test
	fun `an r of a zero byte then a high byte keeps one zero as the DER sign byte`() {
		assertTrue(push(rZeroThenHighByte).verifiedBy(reference))
	}

	@Test
	fun `an s of a zero byte then a high byte keeps one zero as the DER sign byte`() {
		assertTrue(push(sZeroThenHighByte).verifiedBy(reference))
	}

	@Test
	fun `an r with two leading zero bytes verifies`() {
		assertTrue(push(rTwoLeadingZeros).verifiedBy(reference))
	}

	@Test
	fun `a changed JSON byte fails verification`() {
		val tampered = RelayFixtures.PUSH_JSON.replace("hey", "hex")
		assertFalse(RelayFixtures.envelope(tampered, pushSignature).verifiedBy(reference))
	}

	@Test
	fun `JSON that differs only by whitespace or key order fails verification`() {
		val spaced = RelayFixtures.PUSH_JSON.replace(",", ", ")
		val reordered = """{"ts":1793000000,"type":"push","data":{"body":"hey"}}"""
		assertFalse(RelayFixtures.envelope(spaced, pushSignature).verifiedBy(reference))
		assertFalse(RelayFixtures.envelope(reordered, pushSignature).verifiedBy(reference))
	}

	@Test
	fun `a changed signature byte fails verification`() {
		val json = RelayFixtures.PUSH_JSON.toByteArray()
		for (index in listOf(0, 31, 32, 63)) {
			val signature = RelayFixtures.bytes(pushSignature)
			signature[index] = (signature[index].toInt() xor 0x01).toByte()
			assertFalse(SignedEnvelope(json, signature).verifiedBy(reference))
		}
	}

	@Test
	fun `a signature from the relay key fails under another key`() {
		assertFalse(push(pushSignature).verifiedBy(RelayFixtures.smallKey))
	}

	@Test
	fun `the resync signature does not verify the push body`() {
		assertFalse(push(resyncSignature).verifiedBy(reference))
	}

	@Test
	fun `a signature of the wrong size or of zeros fails without throwing`() {
		val json = RelayFixtures.PUSH_JSON.toByteArray()
		val signatures = listOf(
			ByteArray(0),
			ByteArray(63) { 1 },
			ByteArray(65) { 1 },
			ByteArray(64),
			ByteArray(64) { 0xFF.toByte() },
		)
		for (signature in signatures) {
			assertFalse(SignedEnvelope(json, signature).verifiedBy(reference))
		}
	}

	@Test
	fun `the signing domain is part of the signed bytes`() {
		val json = RelayFixtures.PUSH_JSON.toByteArray()
		val signer = Signature.getInstance("SHA256withECDSAinP1363Format")
		signer.initSign(RelayFixtures.privateKey(RelayFixtures.REFERENCE_SCALAR))
		signer.update(json)
		assertFalse(SignedEnvelope(json, signer.sign()).verifiedBy(reference))
	}

	@Test
	fun `JSON is verified as received, with Go escapes left in place`() {
		val envelope = RelayFixtures.signedBy(goEscapedPushJson, RelayFixtures.REFERENCE_SCALAR)
		val decodedJson = """{"type":"push","ts":1793000000,"data":{"body":"$decodedBody"}}"""
		assertTrue(envelope.verifiedBy(reference))
		assertEquals(RelayPush(1793000000, mapOf("body" to decodedBody)), envelope.message())
		assertFalse(RelayFixtures.envelope(decodedJson, envelope.signatureHex()).verifiedBy(reference))
	}

	@Test
	fun `the push Go marshaled with escaped characters verifies under the Go signature and decodes`() {
		assertEquals(goEscapedPushJsonHex, Hex.encode(goEscapedPushJson.toByteArray(Charsets.UTF_8)))
		val envelope = RelayFixtures.envelope(goEscapedPushJson, goEscapedPushSignature)
		assertTrue(envelope.verifiedBy(reference))
		assertEquals(RelayPush(1793000000, mapOf("body" to decodedBody)), envelope.message())
	}

	@Test
	fun `split keeps the last 64 bytes as the signature and the rest as JSON`() {
		val plaintext = RelayFixtures.PUSH_JSON.toByteArray() + RelayFixtures.bytes(pushSignature)
		val envelope = SignedEnvelope.split(plaintext)!!
		assertEquals(pushSignature, envelope.signatureHex())
		assertTrue(envelope.verifiedBy(reference))
		assertEquals(RelayPush(1793000000, mapOf("body" to "hey")), envelope.message())
	}

	@Test
	fun `split accepts more than 64 and at most 2816 bytes`() {
		assertNull(SignedEnvelope.split(ByteArray(0)))
		assertNull(SignedEnvelope.split(ByteArray(64)))
		assertNotNull(SignedEnvelope.split(ByteArray(65)))
		assertNotNull(SignedEnvelope.split(ByteArray(2816)))
		assertNull(SignedEnvelope.split(ByteArray(2817)))
	}

	@Test
	fun `the smallest envelope has one JSON byte`() {
		val envelope = SignedEnvelope.split(byteArrayOf(0x7B) + ByteArray(64) { 0xAB.toByte() })!!
		assertEquals("ab".repeat(64), envelope.signatureHex())
		assertNull(envelope.message())
	}

	@Test
	fun `split copies the plaintext so later changes do not affect the envelope`() {
		val plaintext = RelayFixtures.PUSH_JSON.toByteArray() + RelayFixtures.bytes(pushSignature)
		val envelope = SignedEnvelope.split(plaintext)!!
		plaintext.fill(0)
		assertTrue(envelope.verifiedBy(reference))
	}
}
