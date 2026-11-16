package org.opengrind.push.relay

import java.nio.ByteBuffer
import java.security.MessageDigest
import java.util.Locale

class RelayKey private constructor(private val uncompressed: ByteArray) {
	val hex: String = Hex.encode(uncompressed)

	private val code: Int = run {
		val digest = MessageDigest.getInstance("SHA-256")
		digest.update(CODE_DOMAIN.toByteArray(Charsets.US_ASCII))
		digest.update(uncompressed)
		val leading = ByteBuffer.wrap(digest.digest()).long
		java.lang.Long.remainderUnsigned(leading, CODE_MODULUS).toInt()
	}

	fun bytes(): ByteArray = uncompressed.copyOf()

	fun verificationCode(): String = String.format(Locale.ROOT, "%03d-%03d", code / 1000, code % 1000)

	fun matchesCode(digits: String): Boolean {
		if (digits.length != CODE_DIGITS || digits.any { it !in '0'..'9' }) return false
		return digits.fold(0) { value, digit -> value * 10 + (digit - '0') } == code
	}

	override fun equals(other: Any?): Boolean =
		other is RelayKey && other.uncompressed.contentEquals(uncompressed)

	override fun hashCode(): Int = uncompressed.contentHashCode()

	companion object {
		private const val CODE_DOMAIN = "fcm-relay verification v1"
		private const val CODE_MODULUS = 1_000_000L
		private const val CODE_DIGITS = 6

		fun ofHex(hex: String): RelayKey? {
			if (hex.length != P256.POINT_SIZE * 2) return null
			return Hex.decode(hex)?.let(::of)
		}

		fun of(bytes: ByteArray): RelayKey? =
			if (P256.isUncompressedPoint(bytes)) RelayKey(bytes.copyOf()) else null
	}
}
