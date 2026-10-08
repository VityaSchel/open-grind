package org.opengrind.addon

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.opengrind.update.InstallGate

class AddonGateTest {
	private val releaseCert = InstallGate.RELEASE_CERT_SHA256
	private val playAppSigningCert = "5A".repeat(32)
	private val someoneElsesCert = "0F".repeat(32)
	private val host = "org.opengrind"
	private val addon = "org.opengrind.google_oauth"
	private val otherAddon = "org.opengrind.recaptcha"

	private fun device(
		hostCert: String = releaseCert,
		signers: Map<String, String> = mapOf(addon to releaseCert),
	): AddonGate.SigningCertificates {
		val installed = signers + (host to hostCert)
		return AddonGate.SigningCertificates { packageName, sha256 ->
			installed[packageName] == sha256.joinToString("") { byte -> "%02X".format(byte) }
		}
	}

	private fun decide(
		resolves: Boolean = true,
		presence: AddonGate.Presence = AddonGate.Presence.Enabled,
		turnedOff: Boolean = false,
		certificates: AddonGate.SigningCertificates = device(),
		version: Long? = null,
		minVersion: Long = 0,
	): AddonGate.Verdict = AddonGate.decide(
		addonPackage = addon,
		resolves = resolves,
		presence = presence,
		turnedOff = turnedOff,
		certificates = certificates,
		version = version,
		minVersion = minVersion,
	)

	@Test
	fun `a release-signed add-on that answers the request is launched`() {
		assertEquals(AddonGate.Verdict.Launch, decide())
	}

	@Test
	fun `a Play-signed host still trusts a release-signed add-on`() {
		assertEquals(
			AddonGate.Verdict.Launch,
			decide(certificates = device(hostCert = playAppSigningCert)),
		)
	}

	@Test
	fun `an add-on that resolves is never launched without the release certificate, whoever signed the host and whatever its reported presence`() {
		for (presence in AddonGate.Presence.entries) {
			for (hostCert in listOf(releaseCert, playAppSigningCert, someoneElsesCert)) {
				for (signers in listOf(
					mapOf(addon to someoneElsesCert),
					mapOf(addon to playAppSigningCert),
					mapOf(otherAddon to releaseCert),
					emptyMap(),
				)) {
					assertEquals(
						AddonGate.Verdict.Untrusted,
						decide(
							presence = presence,
							certificates = device(hostCert = hostCert, signers = signers),
						),
					)
				}
			}
		}
	}

	@Test
	fun `a missing add-on is unavailable`() {
		assertEquals(
			AddonGate.Verdict.Unavailable,
			decide(
				resolves = false,
				presence = AddonGate.Presence.Absent,
				certificates = device(signers = emptyMap()),
			),
		)
	}

	@Test
	fun `a turned off add-on is reported as disabled rather than missing`() {
		assertEquals(
			AddonGate.Verdict.Disabled,
			decide(resolves = false, presence = AddonGate.Presence.Disabled),
		)
	}

	@Test
	fun `an enabled add-on that does not answer the request is unavailable`() {
		assertEquals(AddonGate.Verdict.Unavailable, decide(resolves = false))
	}

	@Test
	fun `an enabled add-on signed by someone else that does not answer is untrusted`() {
		assertEquals(
			AddonGate.Verdict.Untrusted,
			decide(
				resolves = false,
				certificates = device(signers = mapOf(addon to someoneElsesCert)),
			),
		)
	}

	@Test
	fun `a disabled add-on signed by someone else is untrusted, never a prompt to turn it on`() {
		assertEquals(
			AddonGate.Verdict.Untrusted,
			decide(
				resolves = false,
				presence = AddonGate.Presence.Disabled,
				certificates = device(signers = mapOf(addon to someoneElsesCert)),
			),
		)
	}

	@Test
	fun `a hidden or frozen add-on is reported as hidden, since its signature cannot be read`() {
		assertEquals(
			AddonGate.Verdict.Hidden,
			decide(
				resolves = false,
				presence = AddonGate.Presence.Hidden,
				certificates = device(signers = emptyMap()),
			),
		)
	}

	@Test
	fun `an enabled add-on whose component is turned off is reported as turned off`() {
		assertEquals(
			AddonGate.Verdict.TurnedOff,
			decide(resolves = false, turnedOff = true),
		)
	}

	@Test
	fun `a turned off component of an add-on signed by someone else is untrusted`() {
		assertEquals(
			AddonGate.Verdict.Untrusted,
			decide(
				resolves = false,
				turnedOff = true,
				certificates = device(signers = mapOf(addon to someoneElsesCert)),
			),
		)
	}

	@Test
	fun `a disabled add-on is reported as disabled even when its component is turned off too`() {
		assertEquals(
			AddonGate.Verdict.Disabled,
			decide(resolves = false, presence = AddonGate.Presence.Disabled, turnedOff = true),
		)
	}

	@Test
	fun `an add-on older than the minimum version is outdated`() {
		assertEquals(
			AddonGate.Verdict.Outdated,
			decide(version = 1_000_000, minVersion = 1_000_001),
		)
	}

	@Test
	fun `an add-on at or above the minimum version, or of unknown version, is launched`() {
		for (version in listOf(1_000_001L, 2_000_000L, null)) {
			assertEquals(
				AddonGate.Verdict.Launch,
				decide(version = version, minVersion = 1_000_001),
			)
		}
	}

	@Test
	fun `an outdated add-on signed by someone else is untrusted`() {
		assertEquals(
			AddonGate.Verdict.Untrusted,
			decide(
				version = 1_000_000,
				minVersion = 1_000_001,
				certificates = device(signers = mapOf(addon to someoneElsesCert)),
			),
		)
	}

	@Test
	fun `a caller that is the release-signed add-on is accepted whoever signed the host`() {
		for (hostCert in listOf(releaseCert, playAppSigningCert)) {
			assertTrue(
				AddonGate.acceptsCaller(
					callingPackage = addon,
					addonPackage = addon,
					certificates = device(hostCert = hostCert),
				),
			)
		}
	}

	@Test
	fun `a caller that is any other package is refused, even one signed with the release certificate`() {
		val impostor = "org.example.google_oauth"
		val certificates = device(
			signers = mapOf(addon to releaseCert, otherAddon to releaseCert, impostor to releaseCert),
		)

		for (caller in listOf(impostor, otherAddon, host, null)) {
			assertFalse(
				AddonGate.acceptsCaller(
					callingPackage = caller,
					addonPackage = addon,
					certificates = certificates,
				),
			)
		}
	}

	@Test
	fun `a caller that is the add-on signed with any other certificate is refused`() {
		for (cert in listOf(someoneElsesCert, playAppSigningCert)) {
			assertFalse(
				AddonGate.acceptsCaller(
					callingPackage = addon,
					addonPackage = addon,
					certificates = device(
						hostCert = playAppSigningCert,
						signers = mapOf(addon to cert),
					),
				),
			)
		}
	}
}
