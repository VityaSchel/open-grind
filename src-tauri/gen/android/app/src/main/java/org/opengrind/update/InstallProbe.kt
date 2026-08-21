package org.opengrind.update

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.SigningInfo
import android.os.Build
import java.io.File
import java.security.MessageDigest

object InstallProbe {
	fun verdictFor(context: Context): InstallGate.Verdict = InstallGate.decide(
		signerSha256 = soleSignerOf(installedSigningInfo(context)),
		installer = installerOf(context),
		updateOwner = updateOwnerOf(context),
		self = context.packageName,
	)

	fun canInstallNow(context: Context): Boolean =
		context.packageManager.canRequestPackageInstalls()

	fun readArchive(
		context: Context,
		apk: File,
	): PackageInfo? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
		context.packageManager.getPackageArchiveInfo(
			apk.absolutePath,
			PackageManager.PackageInfoFlags.of(0L),
		)
	} else {
		@Suppress("DEPRECATION")
		context.packageManager.getPackageArchiveInfo(apk.absolutePath, 0)
	}

	fun soleSignerOf(signing: SigningInfo?): String? {
		if (signing == null || signing.hasMultipleSigners()) return null
		val signers = signing.apkContentsSigners ?: return null
		val sole = signers.singleOrNull() ?: return null
		return sha256Hex(sole.toByteArray())
	}

	fun installedVersionCode(context: Context): Long =
		versionCodeOf(context.packageManager.getPackageInfo(context.packageName, 0))

	fun versionCodeOf(info: PackageInfo): Long =
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
			info.longVersionCode
		} else {
			@Suppress("DEPRECATION")
			info.versionCode.toLong()
		}

	private fun installedSigningInfo(context: Context): SigningInfo? {
		val flags = PackageManager.GET_SIGNING_CERTIFICATES
		val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			context.packageManager.getPackageInfo(
				context.packageName,
				PackageManager.PackageInfoFlags.of(flags.toLong()),
			)
		} else {
			@Suppress("DEPRECATION")
			context.packageManager.getPackageInfo(context.packageName, flags)
		}
		return info.signingInfo
	}

	private fun installerOf(context: Context): String? = try {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
			context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName
		} else {
			@Suppress("DEPRECATION")
			context.packageManager.getInstallerPackageName(context.packageName)
		}
	} catch (e: PackageManager.NameNotFoundException) {
		null
	}

	private fun updateOwnerOf(context: Context): String? = try {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
			context.packageManager.getInstallSourceInfo(context.packageName).updateOwnerPackageName
		} else {
			null
		}
	} catch (e: PackageManager.NameNotFoundException) {
		null
	}

	private fun sha256Hex(der: ByteArray): String =
		MessageDigest.getInstance("SHA-256").digest(der).joinToString("") { byte ->
			"%02X".format(byte)
		}
}
