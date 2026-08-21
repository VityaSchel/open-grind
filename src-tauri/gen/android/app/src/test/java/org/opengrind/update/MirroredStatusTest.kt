package org.opengrind.update

import android.content.pm.PackageInstaller
import org.junit.Assert.assertEquals
import org.junit.Test

class MirroredStatusTest {
	@Test
	fun `every mirrored status matches the platform`() {
		assertEquals(PackageInstaller.STATUS_SUCCESS, InstallStatus.SUCCESS)
		assertEquals(PackageInstaller.STATUS_FAILURE, InstallStatus.FAILURE)
		assertEquals(
			PackageInstaller.STATUS_FAILURE_BLOCKED,
			InstallStatus.FAILURE_BLOCKED,
		)
		assertEquals(
			PackageInstaller.STATUS_FAILURE_ABORTED,
			InstallStatus.FAILURE_ABORTED,
		)
		assertEquals(
			PackageInstaller.STATUS_FAILURE_INVALID,
			InstallStatus.FAILURE_INVALID,
		)
		assertEquals(
			PackageInstaller.STATUS_FAILURE_CONFLICT,
			InstallStatus.FAILURE_CONFLICT,
		)
		assertEquals(
			PackageInstaller.STATUS_FAILURE_STORAGE,
			InstallStatus.FAILURE_STORAGE,
		)
		assertEquals(
			PackageInstaller.STATUS_FAILURE_INCOMPATIBLE,
			InstallStatus.FAILURE_INCOMPATIBLE,
		)
		assertEquals(
			PackageInstaller.STATUS_FAILURE_TIMEOUT,
			InstallStatus.FAILURE_TIMEOUT,
		)
	}

	@Test
	fun `a pending confirmation is not one of the mirrored outcomes`() {
		assertEquals(
			"failed",
			InstallStatus.describe(PackageInstaller.STATUS_PENDING_USER_ACTION),
		)
	}

	@Test
	fun `an outcome delivered before anyone listens is dropped`() {
		InstallEvents.deliver(InstallStatus.outcomeOf(InstallStatus.SUCCESS))
	}
}
