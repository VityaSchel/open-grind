package org.opengrind.push

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.os.Build
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.opengrind.addon.AddonGate
import org.opengrind.addon.AddonLaunchCheck

@InvokeArg
internal class WatchArgs {
	lateinit var onEvent: Channel
}

@InvokeArg
internal class ModeArgs {
	lateinit var mode: String
}

@TauriPlugin(
	permissions = [
		Permission(
			strings = [Manifest.permission.POST_NOTIFICATIONS],
			alias = PushPlugin.NOTIFICATION_ALIAS,
		),
	],
)
class PushPlugin(private val activity: Activity) : Plugin(activity) {

	override fun load(webView: WebView) {
		super.load(webView)
		offerDeeplink(activity.intent)
		runCatching { PushSchedule.follow(activity, PushSettings.mode(activity)) }
	}

	override fun onNewIntent(intent: Intent) = offerDeeplink(intent)

	@Command
	fun addonReady(invoke: Invoke) = gated(invoke) { invoke.resolve() }

	@Command
	fun token(invoke: Invoke) = gated(invoke) {
		FcmRequest(activity, PushContract.MSG_GET_TOKEN) { outcome ->
			when (outcome) {
				is FcmOutcome.Token -> invoke.resolve(JSObject().apply { put("token", outcome.token) })
				is FcmOutcome.Failed -> invoke.reject(outcome.marker, outcome.detail)
				else -> invoke.reject(ERROR_UNAVAILABLE)
			}
		}.send()
	}

	@Command
	fun deleteToken(invoke: Invoke) = gated(invoke) {
		PushNotifier.cancelAll(activity)
		FcmRequest(activity, PushContract.MSG_DELETE_TOKEN) { outcome ->
			when (outcome) {
				FcmOutcome.Deleted -> invoke.resolve()
				is FcmOutcome.Failed -> invoke.reject(outcome.marker, outcome.detail)
				else -> invoke.reject(ERROR_UNAVAILABLE)
			}
		}.send()
	}

	@Command
	fun mode(invoke: Invoke) {
		invoke.resolve(JSObject().apply { put("mode", PushSettings.mode(activity).wire) })
	}

	@Command
	fun setMode(invoke: Invoke) {
		val mode = PushMode.of(invoke.parseArgs(ModeArgs::class.java).mode)
		PushSettings.setMode(activity, mode)
		PushNotifier.createChannels(activity)
		if (mode != PushMode.Fast) PushNotifier.cancelAll(activity)
		PushSchedule.follow(activity, mode)
		invoke.resolve()
	}

	@Command
	fun notificationPermission(invoke: Invoke) = resolvePermission(invoke)

	@Command
	fun requestNotificationPermission(invoke: Invoke) {
		val runtimeGrantNeeded = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
			!PushNotifier.notificationsPermitted(activity)
		if (runtimeGrantNeeded) {
			requestPermissionForAlias(NOTIFICATION_ALIAS, invoke, "resolvePermission")
		} else {
			resolvePermission(invoke)
		}
	}

	@PermissionCallback
	fun resolvePermission(invoke: Invoke) {
		invoke.resolve(
			JSObject().apply { put("granted", PushNotifier.notificationsPermitted(activity)) },
		)
	}

	@Command
	fun watchPush(invoke: Invoke) {
		PushEvents.listen(invoke.parseArgs(WatchArgs::class.java).onEvent)
		invoke.resolve()
	}

	@Command
	fun takeDeeplink(invoke: Invoke) {
		invoke.resolve(JSObject().apply { put("deeplink", PushEvents.takeDeeplink()) })
	}

	private fun offerDeeplink(intent: Intent?) {
		val deeplink = intent?.getStringExtra(PushNotifier.EXTRA_DEEPLINK) ?: return
		intent.removeExtra(PushNotifier.EXTRA_DEEPLINK)
		PushEvents.offerDeeplink(deeplink)
	}

	private fun gated(invoke: Invoke, run: () -> Unit) {
		val intent = Intent(PushContract.ACTION_BIND).setPackage(ADDON_PACKAGE)
		when (AddonLaunchCheck.decideService(activity, intent, ADDON_PACKAGE)) {
			AddonGate.Verdict.Launch -> run()
			AddonGate.Verdict.Unavailable -> invoke.reject(ERROR_UNAVAILABLE)
			AddonGate.Verdict.Disabled -> invoke.reject(ERROR_DISABLED)
			AddonGate.Verdict.Untrusted -> invoke.reject(ERROR_UNTRUSTED)
		}
	}

	internal companion object {
		const val NOTIFICATION_ALIAS = "postNotification"

		const val ADDON_PACKAGE = "org.opengrind.fcm"

		const val ERROR_UNAVAILABLE = "fcm-unavailable"
		const val ERROR_UNTRUSTED = "fcm-untrusted"
		const val ERROR_DISABLED = "fcm-disabled"
	}
}
