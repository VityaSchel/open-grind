package org.opengrind.push.relay

import java.security.KeyPairGenerator
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.Base64

class VapidKeyPair(val publicKey: String, val privateKey: String) {
	companion object {
		fun generate(): VapidKeyPair {
			val generator = KeyPairGenerator.getInstance("EC")
			generator.initialize(ECGenParameterSpec("secp256r1"))
			val pair = generator.generateKeyPair()
			val publicPoint = (pair.public as ECPublicKey).w
			val privateScalar = (pair.private as ECPrivateKey).s
			val uncompressed = byteArrayOf(P256.UNCOMPRESSED_PREFIX) +
				P256.fieldBytes(publicPoint.affineX) +
				P256.fieldBytes(publicPoint.affineY)
			return VapidKeyPair(base64Url(uncompressed), base64Url(P256.fieldBytes(privateScalar)))
		}

		private fun base64Url(bytes: ByteArray): String =
			Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
	}
}
