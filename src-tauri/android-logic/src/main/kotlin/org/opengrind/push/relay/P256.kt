package org.opengrind.push.relay

import java.math.BigInteger
import java.security.KeyFactory
import java.security.PublicKey
import java.security.spec.X509EncodedKeySpec

internal object P256 {
	const val FIELD_SIZE = 32
	const val POINT_SIZE = 1 + 2 * FIELD_SIZE
	const val UNCOMPRESSED_PREFIX: Byte = 0x04

	private val prime = BigInteger(
		"ffffffff00000001000000000000000000000000ffffffffffffffffffffffff",
		16,
	)
	private val coefficientA = prime - BigInteger.valueOf(3)
	private val coefficientB = BigInteger(
		"5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b",
		16,
	)
	private val spkiPrefix =
		Hex.decode("3059301306072a8648ce3d020106082a8648ce3d030107034200")!!

	fun isUncompressedPoint(bytes: ByteArray): Boolean {
		if (bytes.size != POINT_SIZE || bytes[0] != UNCOMPRESSED_PREFIX) return false
		val x = BigInteger(1, bytes.copyOfRange(1, 1 + FIELD_SIZE))
		val y = BigInteger(1, bytes.copyOfRange(1 + FIELD_SIZE, POINT_SIZE))
		if (x >= prime || y >= prime) return false
		val curve = (x * x * x + coefficientA * x + coefficientB).mod(prime)
		return (y * y).mod(prime) == curve
	}

	fun publicKey(uncompressed: ByteArray): PublicKey =
		KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(spkiPrefix + uncompressed))

	fun fieldBytes(value: BigInteger): ByteArray {
		val minimal = value.toByteArray()
		val length = minOf(minimal.size, FIELD_SIZE)
		val padded = ByteArray(FIELD_SIZE)
		System.arraycopy(minimal, minimal.size - length, padded, FIELD_SIZE - length, length)
		return padded
	}
}
