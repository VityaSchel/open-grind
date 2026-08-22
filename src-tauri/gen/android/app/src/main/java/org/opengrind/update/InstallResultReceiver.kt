package org.opengrind.update

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller

class InstallResultReceiver : android.content.BroadcastReceiver() {
	private val hiddenPackageManagerStatusExtra =
		"android.content.pm.extra.LEGACY_STATUS"

	override fun onReceive(
		context: Context,
		intent: Intent,
	) {
		val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
		val packageManagerStatus =
			intent.getIntExtra(hiddenPackageManagerStatusExtra, 0)
		val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
		val live = ApkInstaller.isLive(
			intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1),
		)

		if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
			if (live) confirmationIntent(intent)?.let(PendingConfirmation::offer)
			return
		}
		UpdateLedger.record(context, status, packageManagerStatus, message)
		if (live) {
			InstallEvents.deliver(
				InstallStatus.outcomeOf(status, packageManagerStatus, message),
			)
		}
	}

	private fun confirmationIntent(intent: Intent): Intent? =
		if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
			intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
		} else {
			@Suppress("DEPRECATION")
			intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
		}
}

object PendingConfirmation : Handoff<Intent>()
