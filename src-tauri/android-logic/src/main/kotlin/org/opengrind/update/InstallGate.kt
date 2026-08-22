package org.opengrind.update

object InstallGate {
	const val RELEASE_CERT_SHA256 =
		"2805FDD8F0BADB9424D3244C5E5B3473CEF5B8798EC1117382E89EDA45C3658C"

	val EXTERNAL_UPDATERS = setOf(
		"org.fdroid.fdroid",
		"org.fdroid.fdroid.privileged",
		"org.fdroid.basic",
		"com.looker.droidify",
		"com.machiav3lli.fdroid",
		"dev.imranr.obtainium",
		"dev.imranr.obtainium.fdroid",
		"com.aurora.store",
		"com.android.vending",
	)

	sealed interface Verdict {
		data object Supported : Verdict

		data class ExternallyManaged(val installer: String) : Verdict

		data object ForeignSigner : Verdict
	}

	fun decide(
		signerSha256: String?,
		installer: String?,
		updateOwner: String?,
		self: String,
	): Verdict {
		if (signerSha256 == null || !matchesReleaseCert(signerSha256)) {
			return Verdict.ForeignSigner
		}
		if (updateOwner != null && updateOwner != self) {
			return Verdict.ExternallyManaged(updateOwner)
		}
		if (installer != null && installer in EXTERNAL_UPDATERS) {
			return Verdict.ExternallyManaged(installer)
		}
		return Verdict.Supported
	}

	fun matchesReleaseCert(fingerprint: String): Boolean =
		constantTimeEquals(fingerprint, RELEASE_CERT_SHA256)

	fun mayReplace(
		installedCode: Long,
		archiveCode: Long,
	): Boolean = archiveCode >= installedCode

	private fun constantTimeEquals(
		left: String,
		right: String,
	): Boolean {
		if (left.length != right.length) return false
		var difference = 0
		for (index in left.indices) {
			difference = difference or (left[index].code xor right[index].code)
		}
		return difference == 0
	}
}
