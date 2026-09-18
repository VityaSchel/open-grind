package org.opengrind.update

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

@InvokeArg
internal class InstallArgs {
	lateinit var path: String
	lateinit var packageName: String
}

@InvokeArg
internal class CapabilityArgs {
	var packageName: String? = null
}

@InvokeArg
internal class PackageArgs {
	lateinit var packageName: String
}

@InvokeArg
internal class TransferArgs {
	var packageName: String? = null
	var kind: String? = null
	var purpose: String? = null
}

@InvokeArg
internal class WatchArgs {
	lateinit var onEvent: Channel
}

@TauriPlugin
class UpdatePlugin(private val activity: Activity) : Plugin(activity) {
	private val installing = AtomicBoolean(false)

	private fun isInstallableTarget(packageName: String): Boolean =
		packageName == activity.packageName ||
			packageName == GOOGLE_OAUTH ||
			packageName == RECAPTCHA

	@Command
	fun packageState(invoke: Invoke) {
		val packageName = try {
			invoke.parseArgs(PackageArgs::class.java).packageName
		} catch (e: Exception) {
			invoke.reject("missing")
			return
		}
		if (!isInstallableTarget(packageName)) {
			invoke.reject("unknown-target")
			return
		}
		val state = InstallProbe.stateOf(activity, packageName)
		invoke.resolve(
			JSObject().apply {
				put("installed", state != null)
				put("versionName", state?.versionName)
			},
		)
	}

	@Command
	fun capability(invoke: Invoke) {
		val target = runCatching { invoke.parseArgs(CapabilityArgs::class.java).packageName }
			.getOrNull() ?: activity.packageName
		if (!isInstallableTarget(target)) {
			invoke.reject("unknown-target")
			return
		}
		val verdict = InstallProbe.verdictFor(activity, target)
		val response = JSObject().apply {
			put("supported", verdict is InstallGate.Verdict.Supported)
			put("canInstallNow", InstallProbe.canInstallNow(activity))
			when (verdict) {
				is InstallGate.Verdict.ExternallyManaged -> {
					put("reason", "externally-managed")
					put("installer", verdict.installer)
				}

				is InstallGate.Verdict.ForeignSigner -> put("reason", "foreign-signer")
				is InstallGate.Verdict.ForeignTarget -> put("reason", "foreign-target")
				is InstallGate.Verdict.Supported -> {}
			}
		}
		invoke.resolve(response)
	}

	@Command
	fun watchInstall(invoke: Invoke) {
		try {
			InstallEvents.listen(invoke.parseArgs(WatchArgs::class.java).onEvent)
			invoke.resolve()
		} catch (e: Exception) {
			invoke.reject("watch-failed")
		}
	}

	@Command
	fun install(invoke: Invoke) {
		val (path, target) = try {
			invoke.parseArgs(InstallArgs::class.java).let { it.path to it.packageName }
		} catch (e: Exception) {
			invoke.reject("missing")
			return
		}
		if (!isInstallableTarget(target)) {
			invoke.reject("unknown-target")
			return
		}

		if (!installing.compareAndSet(false, true)) {
			invoke.reject("install-in-progress")
			return
		}

		PendingConfirmation.forget()
		PendingConfirmation.onNext { confirmation ->
			activity.runOnUiThread {
				runCatching { activity.startActivity(confirmation) }
					.onFailure { failure ->
						InstallEvents.deliver(
							InstallStatus.outcomeOf(
								InstallStatus.FAILURE,
								message = failure.message,
								packageName = target,
							),
						)
						ApkInstaller.abandonAll(activity)
					}
			}
		}

		try {
			Thread({
				try {
					ApkInstaller.install(activity, File(path), target)
					invoke.resolve()
				} catch (e: Throwable) {
					PendingConfirmation.forget()
					val marker = if (e is InstallRefused) e.marker else e.message
					invoke.reject(marker ?: "install-failed")
				} finally {
					installing.set(false)
				}
			}, "opengrind-update-install").start()
		} catch (e: Throwable) {
			PendingConfirmation.forget()
			installing.set(false)
			invoke.reject(e.message ?: "install-failed")
		}
	}

	@Command
	fun installPending(invoke: Invoke) {
		invoke.resolve(JSObject().apply { put("pending", ApkInstaller.installPending(activity)) })
	}

	@Command
	fun takeOutcome(invoke: Invoke) {
		invoke.resolve(JSObject().apply { put("outcome", UpdateLedger.take(activity)?.toJson()) })
	}

	@Command
	fun openInstallPermissionSettings(invoke: Invoke) {
		val intent = Intent(
			Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
			Uri.parse("package:${activity.packageName}"),
		)
		try {
			activity.startActivity(intent)
			invoke.resolve()
		} catch (e: Exception) {
			invoke.reject("settings-unavailable")
		}
	}

	@Command
	fun beginTransfer(invoke: Invoke) {
		val title = transferTitle(invoke)
		runCatching { TransferService.start(context = activity, title = title) }
		invoke.resolve()
	}

	@Command
	fun endTransfer(invoke: Invoke) {
		val title = transferTitle(invoke)
		runCatching { TransferService.stop(context = activity, title = title) }
		invoke.resolve()
	}

	private fun transferTitle(invoke: Invoke): TransferTitle {
		val args = runCatching { invoke.parseArgs(TransferArgs::class.java) }.getOrNull()
		return TransferTitle.of(
			updatesThisApp = args == null || args.packageName == activity.packageName,
			addon = when (args?.packageName) {
				GOOGLE_OAUTH -> TransferTitle.Addon.GoogleOauth
				RECAPTCHA -> TransferTitle.Addon.Recaptcha
				else -> null
			},
			kind = args?.kind,
			purpose = args?.purpose,
		)
	}

	private companion object {
		const val GOOGLE_OAUTH = "org.opengrind.google_oauth"
		const val RECAPTCHA = "org.opengrind.recaptcha"
	}
}
