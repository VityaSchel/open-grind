package org.opengrind.addon

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build

object AddonLaunchCheck {
	fun decide(context: Context, request: Intent, addonPackage: String): AddonGate.Verdict {
		val packageManager = context.packageManager
		return verdict(
			packageManager = packageManager,
			addonPackage = addonPackage,
			minVersion = 0,
		) { flags -> packageManager.resolvesActivity(request, PackageManager.MATCH_DEFAULT_ONLY or flags) }
	}

	fun decideService(
		context: Context,
		request: Intent,
		addonPackage: String,
		minVersion: Long,
	): AddonGate.Verdict {
		val packageManager = context.packageManager
		return verdict(
			packageManager = packageManager,
			addonPackage = addonPackage,
			minVersion = minVersion,
		) { flags -> packageManager.resolvesService(request, flags) }
	}

	private fun verdict(
		packageManager: PackageManager,
		addonPackage: String,
		minVersion: Long,
		resolvesWith: (flags: Int) -> Boolean,
	): AddonGate.Verdict {
		val resolves = resolvesWith(0)
		return AddonGate.decide(
			addonPackage = addonPackage,
			resolves = resolves,
			presence = presenceOf(packageManager, addonPackage),
			turnedOff = !resolves && resolvesWith(PackageManager.MATCH_DISABLED_COMPONENTS),
			certificates = packageManager.signingCertificates(),
			version = versionOf(packageManager, addonPackage),
			minVersion = minVersion,
		)
	}

	private fun presenceOf(packageManager: PackageManager, addonPackage: String): AddonGate.Presence {
		val info = packageManager.applicationInfoOrNull(addonPackage, 0)
		if (info != null) return if (info.enabled) AddonGate.Presence.Enabled else AddonGate.Presence.Disabled
		val shelved = packageManager.applicationInfoOrNull(addonPackage, PackageManager.MATCH_UNINSTALLED_PACKAGES)
		val installedButHidden = shelved != null && shelved.flags and ApplicationInfo.FLAG_INSTALLED != 0
		return if (installedButHidden) AddonGate.Presence.Hidden else AddonGate.Presence.Absent
	}

	private fun versionOf(packageManager: PackageManager, addonPackage: String): Long? = try {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			packageManager.getPackageInfo(addonPackage, PackageManager.PackageInfoFlags.of(0L))
		} else {
			@Suppress("DEPRECATION")
			packageManager.getPackageInfo(addonPackage, 0)
		}.longVersionCode
	} catch (e: PackageManager.NameNotFoundException) {
		null
	}

	private fun PackageManager.applicationInfoOrNull(addonPackage: String, flags: Int): ApplicationInfo? = try {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			getApplicationInfo(addonPackage, PackageManager.ApplicationInfoFlags.of(flags.toLong()))
		} else {
			@Suppress("DEPRECATION")
			getApplicationInfo(addonPackage, flags)
		}
	} catch (e: PackageManager.NameNotFoundException) {
		null
	}

	private fun PackageManager.resolvesActivity(request: Intent, flags: Int): Boolean =
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			resolveActivity(request, PackageManager.ResolveInfoFlags.of(flags.toLong()))
		} else {
			@Suppress("DEPRECATION")
			resolveActivity(request, flags)
		} != null

	private fun PackageManager.resolvesService(request: Intent, flags: Int): Boolean =
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			resolveService(request, PackageManager.ResolveInfoFlags.of(flags.toLong()))
		} else {
			@Suppress("DEPRECATION")
			resolveService(request, flags)
		} != null
}
