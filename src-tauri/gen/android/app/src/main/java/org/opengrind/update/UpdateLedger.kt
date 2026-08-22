package org.opengrind.update

import android.content.Context
import android.content.pm.PackageInstaller

object UpdateLedger {
	private const val PREFS = "org.opengrind.update"
	private const val KEY_STATUS = "status"
	private const val KEY_PACKAGE_MANAGER_STATUS = "packageManagerStatus"
	private const val KEY_MESSAGE = "message"

	fun record(
		context: Context,
		status: Int,
		packageManagerStatus: Int,
		message: String?,
	) {
		context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
			.edit()
			.putInt(KEY_STATUS, status)
			.putInt(KEY_PACKAGE_MANAGER_STATUS, packageManagerStatus)
			.putString(KEY_MESSAGE, message)
			.commit()
	}

	fun forgetOutcome(context: Context) {
		context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
			.edit()
			.remove(KEY_STATUS)
			.remove(KEY_PACKAGE_MANAGER_STATUS)
			.remove(KEY_MESSAGE)
			.commit()
	}

	fun take(context: Context): InstallOutcome? {
		val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
		if (!prefs.contains(KEY_STATUS)) return null

		val status = prefs.getInt(KEY_STATUS, PackageInstaller.STATUS_FAILURE)
		val packageManagerStatus = prefs.getInt(KEY_PACKAGE_MANAGER_STATUS, 0)
		val message = prefs.getString(KEY_MESSAGE, null)
		prefs.edit().clear().commit()

		return InstallStatus.outcomeOf(status, packageManagerStatus, message)
	}
}
