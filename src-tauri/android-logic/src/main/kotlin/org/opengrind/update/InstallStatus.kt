package org.opengrind.update

data class InstallOutcome(
	val succeeded: Boolean,
	val canceled: Boolean,
	val code: Int?,
	val message: String?,
)

/** Mirrors PackageInstaller.STATUS_*; MirroredStatusTest pins it to the platform. */
object InstallStatus {
	const val SUCCESS = 0
	const val FAILURE = 1
	const val FAILURE_BLOCKED = 2
	const val FAILURE_ABORTED = 3
	const val FAILURE_INVALID = 4
	const val FAILURE_CONFLICT = 5
	const val FAILURE_STORAGE = 6
	const val FAILURE_INCOMPATIBLE = 7
	const val FAILURE_TIMEOUT = 8

	fun outcomeOf(
		status: Int,
		packageManagerStatus: Int = 0,
		message: String? = null,
	): InstallOutcome = InstallOutcome(
		succeeded = status == SUCCESS,
		canceled = status == FAILURE_ABORTED,
		code = if (packageManagerStatus != 0) packageManagerStatus else status,
		message = message ?: describe(status),
	)

	fun describe(status: Int): String = when (status) {
		SUCCESS -> "installed"
		FAILURE_ABORTED -> "canceled"
		FAILURE_BLOCKED -> "blocked by the device or a policy"
		FAILURE_CONFLICT -> "conflicts with the installed app"
		FAILURE_INCOMPATIBLE -> "not compatible with this device"
		FAILURE_INVALID -> "rejected as invalid"
		FAILURE_STORAGE -> "not enough storage"
		FAILURE_TIMEOUT -> "timed out"
		else -> "failed"
	}
}
