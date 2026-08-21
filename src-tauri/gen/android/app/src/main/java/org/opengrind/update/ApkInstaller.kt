package org.opengrind.update

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import java.io.File

class InstallRefused(val marker: String) : Exception(marker)

object ApkInstaller {
	private const val ENTRY = "base.apk"
	private const val BUFFER = 1 shl 16

	private val live = LiveSession()

	fun isLive(sessionId: Int): Boolean = live.isLive(sessionId)

	fun install(
		context: Context,
		apk: File,
	) {
		if (!apk.isFile || apk.length() == 0L) throw InstallRefused("missing")
		when (InstallProbe.verdictFor(context)) {
			is InstallGate.Verdict.Supported -> {}
			is InstallGate.Verdict.ExternallyManaged -> throw InstallRefused("externally-managed")
			is InstallGate.Verdict.ForeignSigner -> throw InstallRefused("foreign-signer")
		}
		if (!InstallProbe.canInstallNow(context)) throw InstallRefused("unknown-sources")

		val archive = InstallProbe.readArchive(context, apk) ?: throw InstallRefused("unreadable")
		if (archive.packageName != context.packageName) throw InstallRefused("package-mismatch")
		if (!InstallGate.mayReplace(InstallProbe.installedVersionCode(context), InstallProbe.versionCodeOf(archive))) {
			throw InstallRefused("downgrade")
		}

		val installer = context.packageManager.packageInstaller
		abandonAll(context)

		val total = apk.length()
		val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
			.apply {
				setAppPackageName(context.packageName)
				setSize(total)
				setInstallReason(PackageManager.INSTALL_REASON_USER)
				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
					setPackageSource(PackageInstaller.PACKAGE_SOURCE_STORE)
				}
			}

		val sessionId = installer.createSession(params)
		live.claim(sessionId)
		try {
			installer.openSession(sessionId).use { session ->
				session.openWrite(ENTRY, 0, total).use { output ->
					apk.inputStream().use { input -> input.copyTo(output, BUFFER) }
					session.fsync(output)
				}
				UpdateLedger.forgetOutcome(context)
				session.commit(statusSender(context, sessionId))
			}
		} catch (e: Throwable) {
			live.release()
			runCatching { installer.abandonSession(sessionId) }
			throw e
		}
	}

	fun abandonAll(context: Context) {
		live.release()
		val installer = context.packageManager.packageInstaller
		installer.mySessions.forEach { session ->
			runCatching { installer.abandonSession(session.sessionId) }
		}
	}

	// targetSdk 35+ rejects an immutable PendingIntent
	private fun statusSender(
		context: Context,
		sessionId: Int,
	): IntentSender {
		val intent = Intent(context, InstallResultReceiver::class.java)
		var flags = PendingIntent.FLAG_UPDATE_CURRENT
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
			flags = flags or PendingIntent.FLAG_MUTABLE
		}
		return PendingIntent
			.getBroadcast(context.applicationContext, sessionId, intent, flags)
			.intentSender
	}
}
