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
}

@InvokeArg
internal class WatchArgs {
	lateinit var onEvent: Channel
}

@TauriPlugin
class UpdatePlugin(private val activity: Activity) : Plugin(activity) {
	private val installing = AtomicBoolean(false)

	@Command
	fun capability(invoke: Invoke) {
		val verdict = InstallProbe.verdictFor(activity)
		val response = JSObject().apply {
			put("supported", verdict is InstallGate.Verdict.Supported)
			put("canInstallNow", InstallProbe.canInstallNow(activity))
			when (verdict) {
				is InstallGate.Verdict.ExternallyManaged -> {
					put("reason", "externally-managed")
					put("installer", verdict.installer)
				}

				is InstallGate.Verdict.ForeignSigner -> put("reason", "foreign-signer")
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
		val path = try {
			invoke.parseArgs(InstallArgs::class.java).path
		} catch (e: Exception) {
			invoke.reject("missing")
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
							),
						)
						ApkInstaller.abandonAll(activity)
					}
			}
		}

		try {
			Thread({
				try {
					ApkInstaller.install(activity, File(path))
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
		runCatching { TransferService.start(activity) }
		invoke.resolve()
	}

	@Command
	fun endTransfer(invoke: Invoke) {
		runCatching { TransferService.stop(activity) }
		invoke.resolve()
	}
}
