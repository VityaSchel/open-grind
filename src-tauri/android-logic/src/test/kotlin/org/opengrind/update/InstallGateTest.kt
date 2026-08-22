package org.opengrind.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InstallGateTest {
	private val releaseCert = InstallGate.RELEASE_CERT_SHA256
	private val self = "org.opengrind"

	@Test
	fun `a sideloaded release build may update itself`() {
		assertEquals(
			InstallGate.Verdict.Supported,
			InstallGate.decide(releaseCert, installer = null, updateOwner = null, self = self),
		)
	}

	@Test
	fun `an install from a browser or file manager still updates itself`() {
		assertEquals(
			InstallGate.Verdict.Supported,
			InstallGate.decide(releaseCert, "com.android.chrome", null, self),
		)
	}

	@Test
	fun `an f-droid install stands down`() {
		val verdict = InstallGate.decide(releaseCert, "org.fdroid.fdroid", null, self)
		assertEquals(InstallGate.Verdict.ExternallyManaged("org.fdroid.fdroid"), verdict)
	}

	@Test
	fun `every known store and updater stands down`() {
		for (installer in InstallGate.EXTERNAL_UPDATERS) {
			assertEquals(
				InstallGate.Verdict.ExternallyManaged(installer),
				InstallGate.decide(releaseCert, installer, null, self),
			)
		}
	}

	@Test
	fun `another app owning updates stands down even when the installer is unknown`() {
		assertEquals(
			InstallGate.Verdict.ExternallyManaged("com.example.store"),
			InstallGate.decide(releaseCert, null, "com.example.store", self),
		)
	}

	@Test
	fun `owning our own updates is not external`() {
		assertEquals(
			InstallGate.Verdict.Supported,
			InstallGate.decide(releaseCert, null, self, self),
		)
	}

	@Test
	fun `a build signed by anyone else can never update itself`() {
		val debugCert = "A".repeat(64)
		assertEquals(
			InstallGate.Verdict.ForeignSigner,
			InstallGate.decide(debugCert, null, null, self),
		)
		assertEquals(
			InstallGate.Verdict.ForeignSigner,
			InstallGate.decide(null, null, null, self),
		)
	}

	@Test
	fun `the signer check runs before the installer check`() {
		assertEquals(
			InstallGate.Verdict.ForeignSigner,
			InstallGate.decide("A".repeat(64), "org.fdroid.fdroid", null, self),
		)
	}

	@Test
	fun `certificate comparison is exact`() {
		assertTrue(InstallGate.matchesReleaseCert(releaseCert))
		assertFalse(InstallGate.matchesReleaseCert(releaseCert.lowercase()))
		assertFalse(InstallGate.matchesReleaseCert(releaseCert.dropLast(1)))
		assertFalse(InstallGate.matchesReleaseCert(""))
	}

	@Test
	fun `reinstalling the same version code is allowed`() {
		assertTrue(InstallGate.mayReplace(installedCode = 42L, archiveCode = 42L))
	}

	@Test
	fun `upgrading to a higher version code is allowed`() {
		assertTrue(InstallGate.mayReplace(installedCode = 42L, archiveCode = 43L))
	}

	@Test
	fun `downgrading to a lower version code is refused`() {
		assertFalse(InstallGate.mayReplace(installedCode = 42L, archiveCode = 41L))
	}
}
