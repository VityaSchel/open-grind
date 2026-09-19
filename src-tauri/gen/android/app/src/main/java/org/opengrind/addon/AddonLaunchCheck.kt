package org.opengrind.addon

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

object AddonLaunchCheck {
	fun decide(context: Context, request: Intent, addonPackage: String): AddonGate.Verdict =
		verdict(context, addonPackage, request.resolveActivity(context.packageManager) != null)

	fun decideService(context: Context, request: Intent, addonPackage: String): AddonGate.Verdict =
		verdict(context, addonPackage, context.packageManager.resolveService(request, 0) != null)

	private fun verdict(context: Context, addonPackage: String, resolves: Boolean): AddonGate.Verdict {
		val packageManager = context.packageManager
		return AddonGate.decide(
			addonPackage = addonPackage,
			resolves = resolves,
			presence = presenceOf(packageManager, addonPackage),
			certificates = packageManager.signingCertificates(),
		)
	}

	private fun presenceOf(packageManager: PackageManager, addonPackage: String): AddonGate.Presence = try {
		val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			packageManager.getApplicationInfo(addonPackage, PackageManager.ApplicationInfoFlags.of(0L))
		} else {
			@Suppress("DEPRECATION")
			packageManager.getApplicationInfo(addonPackage, 0)
		}
		if (info.enabled) AddonGate.Presence.Enabled else AddonGate.Presence.Disabled
	} catch (e: PackageManager.NameNotFoundException) {
		AddonGate.Presence.Absent
	}
}
