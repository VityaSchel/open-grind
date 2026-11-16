package org.opengrind.push.relay

import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPrivateKeySpec

internal object RelayFixtures {
	const val REFERENCE_SCALAR = "c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721"
	const val REFERENCE_PUBLIC = "04" +
		"60fed4ba255a9d31c961eb74c6356d68c049b8923b61fa6ce669622e60f29fb6" +
		"7903fe1008b8bc99a41ae9e95628bc64f2f1b20c2d7e9f5177a3c294d4462299"
	const val SMALL_PUBLIC = "04" +
		"dc7cecff045d94a8b74b34e397899baef9c22554d69132621005aeb8ba473a30" +
		"6396e07f1b9f5eb7bc1aa09437b9abf61646722972a80b187d56e600e96f1248"

	const val PUSH_JSON = """{"type":"push","ts":1793000000,"data":{"body":"hey"}}"""
	const val RESYNC_JSON = """{"type":"resync","ts":1793000000,"fcmToken":"fid:APA91bX",""" +
		""""relayKey":"$REFERENCE_PUBLIC"}"""

	val referenceKey: RelayKey = RelayKey.ofHex(REFERENCE_PUBLIC)!!
	val smallKey: RelayKey = RelayKey.ofHex(SMALL_PUBLIC)!!

	fun bytes(hex: String): ByteArray = Hex.decode(hex)!!

	fun envelope(json: String, signatureHex: String) =
		SignedEnvelope(json.toByteArray(Charsets.UTF_8), bytes(signatureHex))

	fun unsigned(json: String) = SignedEnvelope(json.toByteArray(Charsets.UTF_8), ByteArray(64))

	fun privateKey(scalarHex: String): PrivateKey = privateKey(BigInteger(scalarHex, 16))

	fun privateKey(scalar: ByteArray): PrivateKey = privateKey(BigInteger(1, scalar))

	fun rawSignature(json: ByteArray, key: PrivateKey): ByteArray {
		val signer = Signature.getInstance("SHA256withECDSAinP1363Format")
		signer.initSign(key)
		signer.update("open-grind envelope v1\u0000".toByteArray(Charsets.US_ASCII))
		signer.update(json)
		return signer.sign()
	}

	fun signedBy(json: String, scalarHex: String): SignedEnvelope {
		val bytes = json.toByteArray(Charsets.UTF_8)
		return SignedEnvelope(bytes, rawSignature(bytes, privateKey(scalarHex)))
	}

	private fun privateKey(scalar: BigInteger): PrivateKey {
		val parameters = AlgorithmParameters.getInstance("EC")
		parameters.init(ECGenParameterSpec("secp256r1"))
		val spec = ECPrivateKeySpec(scalar, parameters.getParameterSpec(ECParameterSpec::class.java))
		return KeyFactory.getInstance("EC").generatePrivate(spec)
	}
}
