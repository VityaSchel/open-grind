package org.opengrind.push.relay

internal object CompactJson {
	private const val FIRST_UNESCAPED = 0x20
	private const val ESCAPE_DIGITS = 4
	private const val HEX_RADIX = 16

	fun string(value: String): String = buildString(value.length + 2) {
		append('"')
		for (character in value) {
			when {
				character == '"' || character == '\\' -> append('\\').append(character)
				character.code < FIRST_UNESCAPED -> append('\\').append('u')
					.append(character.code.toString(HEX_RADIX).padStart(ESCAPE_DIGITS, '0'))
				else -> append(character)
			}
		}
		append('"')
	}

	fun objectOf(vararg members: Pair<String, String>): String =
		members.joinToString(separator = ",", prefix = "{", postfix = "}") { (name, value) ->
			"${string(name)}:$value"
		}
}
