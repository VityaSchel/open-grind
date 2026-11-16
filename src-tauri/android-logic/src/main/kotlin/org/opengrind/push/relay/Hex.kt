package org.opengrind.push.relay

internal object Hex {
	private const val DIGITS = "0123456789abcdef"

	fun encode(bytes: ByteArray): String {
		val out = StringBuilder(bytes.size * 2)
		for (byte in bytes) {
			val value = byte.toInt() and 0xFF
			out.append(DIGITS[value ushr 4]).append(DIGITS[value and 0x0F])
		}
		return out.toString()
	}

	fun decode(hex: String): ByteArray? {
		if (hex.length % 2 != 0) return null
		val out = ByteArray(hex.length / 2)
		for (index in out.indices) {
			val high = nibble(hex[index * 2]) ?: return null
			val low = nibble(hex[index * 2 + 1]) ?: return null
			out[index] = ((high shl 4) or low).toByte()
		}
		return out
	}

	private fun nibble(char: Char): Int? = when (char) {
		in '0'..'9' -> char - '0'
		in 'a'..'f' -> char - 'a' + 10
		in 'A'..'F' -> char - 'A' + 10
		else -> null
	}
}
