package org.opengrind.push.relay

import java.security.Signature

class SignedEnvelope(private val json: ByteArray, private val signature: ByteArray) {
	fun signatureHex(): String = Hex.encode(signature)

	fun verifiedBy(key: RelayKey): Boolean = try {
		val verifier = Signature.getInstance("SHA256withECDSA")
		verifier.initVerify(P256.publicKey(key.bytes()))
		verifier.update(SIGNING_DOMAIN)
		verifier.update(json)
		verifier.verify(derSignature())
	} catch (e: Exception) {
		false
	}

	fun message(): RelayMessage? = RelayMessage.parse(json)

	private fun derSignature(): ByteArray {
		require(signature.size == RAW_SIGNATURE_SIZE)
		val r = derInteger(signature.copyOfRange(0, P256.FIELD_SIZE))
		val s = derInteger(signature.copyOfRange(P256.FIELD_SIZE, RAW_SIGNATURE_SIZE))
		return byteArrayOf(DER_SEQUENCE, (r.size + s.size).toByte()) + r + s
	}

	private fun derInteger(unsigned: ByteArray): ByteArray {
		val firstSignificant = unsigned.indexOfFirst { it != 0.toByte() }
		val magnitude = if (firstSignificant < 0) {
			byteArrayOf(0)
		} else {
			unsigned.copyOfRange(firstSignificant, unsigned.size)
		}
		val content = if (magnitude[0] < 0) byteArrayOf(0) + magnitude else magnitude
		return byteArrayOf(DER_INTEGER, content.size.toByte()) + content
	}

	companion object {
		private const val RAW_SIGNATURE_SIZE = 2 * P256.FIELD_SIZE
		private const val MAX_PLAINTEXT_SIZE = 2816
		private const val DER_SEQUENCE: Byte = 0x30
		private const val DER_INTEGER: Byte = 0x02
		private val SIGNING_DOMAIN =
			"open-grind envelope v1\u0000".toByteArray(Charsets.US_ASCII)

		fun split(plaintext: ByteArray): SignedEnvelope? {
			if (plaintext.size <= RAW_SIGNATURE_SIZE) return null
			if (plaintext.size > MAX_PLAINTEXT_SIZE) return null
			val boundary = plaintext.size - RAW_SIGNATURE_SIZE
			return SignedEnvelope(
				plaintext.copyOfRange(0, boundary),
				plaintext.copyOfRange(boundary, plaintext.size),
			)
		}
	}
}
