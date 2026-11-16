package org.opengrind.push.relay

fun isRegistrableToken(token: String): Boolean {
	if (!token.all { it.code in 0x21..0x7E }) return false
	val separator = token.indexOf(':')
	return separator > 0 && separator < token.length - 1
}
