package org.opengrind.addon

import org.opengrind.update.InstallGate

object AddonGate {
	private val releaseCertSha256: ByteArray = InstallGate.RELEASE_CERT_SHA256
		.chunked(2)
		.map { pair -> pair.toInt(16).toByte() }
		.toByteArray()

	fun interface SigningCertificates {
		fun has(packageName: String, sha256: ByteArray): Boolean
	}

	enum class Presence {
		Absent,
		Hidden,
		Disabled,
		Enabled,
	}

	enum class Verdict {
		Launch,
		Unavailable,
		Disabled,
		Untrusted,
		Hidden,
		TurnedOff,
		Outdated,
	}

	fun decide(
		addonPackage: String,
		resolves: Boolean,
		presence: Presence,
		turnedOff: Boolean,
		certificates: SigningCertificates,
		version: Long? = null,
		minVersion: Long = 0,
	): Verdict = when {
		resolves && !releaseSigned(addonPackage, certificates) -> Verdict.Untrusted
		presence == Presence.Hidden -> Verdict.Hidden
		presence != Presence.Absent && !releaseSigned(addonPackage, certificates) -> Verdict.Untrusted
		!resolves && presence == Presence.Disabled -> Verdict.Disabled
		!resolves && turnedOff -> Verdict.TurnedOff
		!resolves -> Verdict.Unavailable
		version != null && version < minVersion -> Verdict.Outdated
		else -> Verdict.Launch
	}

	fun acceptsCaller(
		callingPackage: String?,
		addonPackage: String,
		certificates: SigningCertificates,
	): Boolean = callingPackage == addonPackage && releaseSigned(addonPackage, certificates)

	private fun releaseSigned(addonPackage: String, certificates: SigningCertificates): Boolean =
		certificates.has(packageName = addonPackage, sha256 = releaseCertSha256)
}
