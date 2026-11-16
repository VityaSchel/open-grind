package org.opengrind.push.relay

data class Seen(val repeated: Boolean, val ring: List<String>)

object SeenSignatures {
	fun remember(ring: List<String>, signatureHex: String, capacity: Int = 64): Seen {
		if (signatureHex in ring) return Seen(repeated = true, ring = ring.takeLast(capacity))
		return Seen(repeated = false, ring = (ring + signatureHex).takeLast(capacity))
	}
}
