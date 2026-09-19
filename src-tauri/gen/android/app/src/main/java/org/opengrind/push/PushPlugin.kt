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
import app.tauri.plugin.JSArray
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

@InvokeArg
internal class EnabledArgs {
	var enabled: Boolean = false
}

@InvokeArg
internal class CategoryArgs {
	lateinit var category: String
	var enabled: Boolean = true
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
	fun notificationsEnabled(invoke: Invoke) {
		invoke.resolve(
			JSObject().apply {
				put("enabled", PushSettings.notificationsEnabled(activity))
			},
		)
	}

	@Command
	fun setNotificationsEnabled(invoke: Invoke) {
		val enabled = invoke.parseArgs(EnabledArgs::class.java).enabled
		PushSettings.setNotificationsEnabled(activity, enabled)
		if (enabled) {
			PushNotifier.createChannels(activity)
		} else {
			PushNotifier.cancelAll(activity)
			PushSettings.setWatermark(activity, 0L)
		}
		PushSchedule.follow(activity, PushSettings.mode(activity))
		invoke.resolve()
	}

	@Command
	fun openNotificationSettings(invoke: Invoke) {
		PushNotifier.openAppNotificationSettings(activity)
		invoke.resolve()
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
	fun categories(invoke: Invoke) {
		PushNotifier.createChannels(activity)
		val entries = PushKind.entries.map { kind ->
			JSObject().apply {
				put("category", PushCategories.wireOf(kind))
				put("enabled", PushSettings.categoryEnabled(activity, kind))
				put("systemBlocked", PushNotifier.channelBlocked(activity, kind))
			}
		}
		invoke.resolve(JSObject().apply { put("categories", JSArray(entries)) })
	}

	@Command
	fun setCategory(invoke: Invoke) {
		val args = invoke.parseArgs(CategoryArgs::class.java)
		val kind = PushCategories.kindOf(args.category)
		if (kind == null) {
			invoke.reject("unknown category")
			return
		}
		PushSettings.setCategoryEnabled(activity, kind, args.enabled)
		if (!args.enabled) PushNotifier.cancelCategory(activity, kind)
		invoke.resolve()
	}

	@Command
	fun openCategorySettings(invoke: Invoke) {
		val kind = PushCategories.kindOf(
			invoke.parseArgs(CategoryArgs::class.java).category,
		)
		if (kind == null) {
			invoke.reject("unknown category")
			return
		}
		PushNotifier.createChannels(activity)
		PushNotifier.openChannelSettings(activity, kind)
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
		val granted = PushNotifier.notificationsPermitted(activity)
		invoke.resolve(
			JSObject().apply {
				put("granted", granted)
				put("state", if (granted) STATE_GRANTED else deniedState())
			},
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

	private fun deniedState(): String {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return STATE_DENIED
		val state = getPermissionState(NOTIFICATION_ALIAS)?.toString()
		return if (state == null || state == STATE_GRANTED) STATE_DENIED else state
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

		const val STATE_GRANTED = "granted"
		const val STATE_DENIED = "denied"

		const val ADDON_PACKAGE = "org.opengrind.fcm"

		const val ERROR_UNAVAILABLE = "fcm-unavailable"
		const val ERROR_UNTRUSTED = "fcm-untrusted"
		const val ERROR_DISABLED = "fcm-disabled"
	}
}
