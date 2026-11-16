package org.opengrind.push.relay

import java.util.Locale
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RelayKeyTest {
	private val reference = RelayFixtures.referenceKey
	private val small = RelayFixtures.smallKey

	@Test
	fun `the reference key shows 658-591 although its digest prefix exceeds Long MAX_VALUE`() {
		assertEquals("658-591", reference.verificationCode())
	}

	@Test
	fun `a code below one thousand keeps its leading zeros`() {
		assertEquals("000-766", small.verificationCode())
	}

	@Test
	fun `the code is formatted with ASCII digits under an Arabic default locale`() {
		val previous = Locale.getDefault()
		try {
			Locale.setDefault(Locale.forLanguageTag("ar-EG"))
			assertNotEquals("658", String.format("%03d", 658))
			assertEquals("658-591", RelayKey.ofHex(RelayFixtures.REFERENCE_PUBLIC)!!.verificationCode())
			assertEquals("000-766", small.verificationCode())
			assertTrue(reference.matchesCode("658591"))
		} finally {
			Locale.setDefault(previous)
		}
	}

	@Test
	fun `the typed code matches only the six digits of this key's code`() {
		assertTrue(reference.matchesCode("658591"))
		assertTrue(small.matchesCode("000766"))
		assertFalse(reference.matchesCode("658592"))
		assertFalse(reference.matchesCode("000766"))
		assertFalse(small.matchesCode("658591"))
	}

	@Test
	fun `anything other than exactly six ASCII digits never matches`() {
		val attempts = listOf(
			"",
			"766",
			"00766",
			"0000766",
			"000-766",
			" 000766",
			"000766 ",
			"+00766",
			"-00766",
			"٠٠٠٧٦٦",
			"０００７６６",
		)
		for (typed in attempts) {
			assertFalse(typed, small.matchesCode(typed))
		}
	}

	@Test
	fun `hex is the 130 lowercase characters of the uncompressed point`() {
		val key = RelayKey.ofHex(RelayFixtures.REFERENCE_PUBLIC.uppercase())!!
		assertEquals(RelayFixtures.REFERENCE_PUBLIC, key.hex)
		assertEquals(130, key.hex.length)
	}

	@Test
	fun `bytes returns a copy that cannot change the key`() {
		val bytes = reference.bytes()
		assertArrayEquals(RelayFixtures.bytes(RelayFixtures.REFERENCE_PUBLIC), bytes)
		bytes[1] = 0
		assertEquals(RelayFixtures.REFERENCE_PUBLIC, reference.hex)
		assertArrayEquals(RelayFixtures.bytes(RelayFixtures.REFERENCE_PUBLIC), reference.bytes())
	}

	@Test
	fun `a key built from bytes does not change when the caller reuses the array`() {
		val source = RelayFixtures.bytes(RelayFixtures.REFERENCE_PUBLIC)
		val key = RelayKey.of(source)!!
		source[1] = 0
		assertEquals(RelayFixtures.REFERENCE_PUBLIC, key.hex)
	}

	@Test
	fun `keys of the same point are equal`() {
		assertEquals(reference, RelayKey.of(RelayFixtures.bytes(RelayFixtures.REFERENCE_PUBLIC)))
		assertEquals(reference.hashCode(), RelayKey.ofHex(RelayFixtures.REFERENCE_PUBLIC)!!.hashCode())
		assertNotEquals(reference, small)
	}

	@Test
	fun `only a 65-byte uncompressed point on the curve is a relay key`() {
		val point = RelayFixtures.bytes(RelayFixtures.REFERENCE_PUBLIC)
		val offCurve = point.copyOf().also { it[64] = (it[64] + 1).toByte() }
		val compressedPrefix = point.copyOf().also { it[0] = 0x03 }
		val hybridPrefix = point.copyOf().also { it[0] = 0x07 }
		val compressed = byteArrayOf(0x03) + point.copyOfRange(1, 33)
		val xAbovePrime = byteArrayOf(0x04) + ByteArray(32) { 0xFF.toByte() } + point.copyOfRange(33, 65)
		val rejected = listOf(
			ByteArray(0),
			ByteArray(65),
			point.copyOf(64),
			point + 0,
			offCurve,
			compressedPrefix,
			hybridPrefix,
			compressed,
			xAbovePrime,
		)
		for (bytes in rejected) {
			assertNull(RelayKey.of(bytes))
		}
	}

	@Test
	fun `hex of the wrong length or with non-hex characters is not a relay key`() {
		val hex = RelayFixtures.REFERENCE_PUBLIC
		val rejected = listOf(
			"",
			hex.dropLast(2),
			hex + "00",
			hex.dropLast(1),
			hex.dropLast(1) + "g",
			"0x" + hex.drop(2),
			" " + hex.drop(1),
		)
		for (candidate in rejected) {
			assertNull(candidate, RelayKey.ofHex(candidate))
		}
	}
}
