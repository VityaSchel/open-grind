package org.opengrind.push.relay

import java.math.BigInteger
import java.util.Base64
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VapidKeyPairTest {
	private val unpaddedBase64Url = Regex("[A-Za-z0-9_-]+")

	private fun decode(value: String): ByteArray = Base64.getUrlDecoder().decode(value)

	@Test
	fun `the public key is an 87-character unpadded base64url uncompressed point on the curve`() {
		repeat(16) {
			val pair = VapidKeyPair.generate()
			assertEquals(87, pair.publicKey.length)
			assertTrue(pair.publicKey, unpaddedBase64Url.matches(pair.publicKey))
			val point = decode(pair.publicKey)
			assertEquals(65, point.size)
			assertEquals(0x04.toByte(), point[0])
			assertNotNull(RelayKey.of(point))
		}
	}

	@Test
	fun `the private key is a 43-character unpadded base64url 32-byte scalar`() {
		repeat(16) {
			val pair = VapidKeyPair.generate()
			assertEquals(43, pair.privateKey.length)
			assertTrue(pair.privateKey, unpaddedBase64Url.matches(pair.privateKey))
			assertEquals(32, decode(pair.privateKey).size)
		}
	}

	@Test
	fun `the private scalar belongs to the public point`() {
		val json = RelayFixtures.PUSH_JSON.toByteArray()
		repeat(8) {
			val pair = VapidKeyPair.generate()
			val privateKey = RelayFixtures.privateKey(decode(pair.privateKey))
			val signature = RelayFixtures.rawSignature(json, privateKey)
			assertTrue(SignedEnvelope(json, signature).verifiedBy(RelayKey.of(decode(pair.publicKey))!!))
		}
	}

	@Test
	fun `every generated pair is new`() {
		val first = VapidKeyPair.generate()
		val second = VapidKeyPair.generate()
		assertNotEquals(first.privateKey, second.privateKey)
		assertNotEquals(first.publicKey, second.publicKey)
	}

	@Test
	fun `field elements are left-padded to 32 bytes without a sign byte`() {
		val short = BigInteger("0102", 16)
		assertArrayEquals(ByteArray(30) + byteArrayOf(0x01, 0x02), P256.fieldBytes(short))
		val highBit = BigInteger("ff" + "00".repeat(31), 16)
		assertEquals(33, highBit.toByteArray().size)
		assertArrayEquals(byteArrayOf(0xFF.toByte()) + ByteArray(31), P256.fieldBytes(highBit))
		val thirtyOneBytes = BigInteger("7f".repeat(31), 16)
		assertArrayEquals(byteArrayOf(0) + ByteArray(31) { 0x7F }, P256.fieldBytes(thirtyOneBytes))
	}
}
