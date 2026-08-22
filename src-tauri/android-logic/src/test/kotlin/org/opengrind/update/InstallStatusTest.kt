package org.opengrind.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InstallStatusTest {
	@Test
	fun `only a success counts as installed`() {
		assertTrue(
			InstallStatus.outcomeOf(InstallStatus.SUCCESS).succeeded,
		)
		for (status in FAILURES) {
			assertFalse(
				"status $status must not read as installed",
				InstallStatus.outcomeOf(status).succeeded,
			)
		}
	}

	@Test
	fun `only an abort counts as cancelled`() {
		assertTrue(
			InstallStatus
				.outcomeOf(InstallStatus.FAILURE_ABORTED)
				.canceled,
		)
		assertFalse(
			InstallStatus.outcomeOf(InstallStatus.FAILURE).canceled,
		)
		assertFalse(
			InstallStatus.outcomeOf(InstallStatus.SUCCESS).canceled,
		)
	}

	@Test
	fun `the package manager status wins over the installer status`() {
		val detailed = InstallStatus.outcomeOf(
			status = InstallStatus.FAILURE,
			packageManagerStatus = -25,
		)

		assertEquals(-25, detailed.code)
		assertEquals(
			InstallStatus.FAILURE_CONFLICT,
			InstallStatus
				.outcomeOf(InstallStatus.FAILURE_CONFLICT)
				.code,
		)
	}

	@Test
	fun `a message from the system is kept, and one is invented when absent`() {
		assertEquals(
			"INSTALL_FAILED_VERSION_DOWNGRADE",
			InstallStatus
				.outcomeOf(
					status = InstallStatus.FAILURE_CONFLICT,
					message = "INSTALL_FAILED_VERSION_DOWNGRADE",
				)
				.message,
		)
		assertEquals(
			"conflicts with the installed app",
			InstallStatus
				.outcomeOf(InstallStatus.FAILURE_CONFLICT)
				.message,
		)
	}

	@Test
	fun `every failure the installer can report has its own wording`() {
		val worded = FAILURES.map(InstallStatus::describe)

		assertEquals(
			"each failure needs distinct copy, got $worded",
			FAILURES.size,
			worded.toSet().size,
		)
		assertTrue(worded.none(String::isBlank))
	}

	@Test
	fun `an unknown status still describes itself`() {
		assertEquals("failed", InstallStatus.describe(Int.MIN_VALUE))
	}

	private companion object {
		val FAILURES = listOf(
			InstallStatus.FAILURE,
			InstallStatus.FAILURE_ABORTED,
			InstallStatus.FAILURE_BLOCKED,
			InstallStatus.FAILURE_CONFLICT,
			InstallStatus.FAILURE_INCOMPATIBLE,
			InstallStatus.FAILURE_INVALID,
			InstallStatus.FAILURE_STORAGE,
			InstallStatus.FAILURE_TIMEOUT,
		)
	}
}
