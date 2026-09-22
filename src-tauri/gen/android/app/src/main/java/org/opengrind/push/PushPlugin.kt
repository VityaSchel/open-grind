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

private const val NOTIFICATION_ALIAS = "postNotification"
private const val ERROR_SETTINGS_UNAVAILABLE = "settings-unavailable"

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
			alias = NOTIFICATION_ALIAS,
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
	fun token(invoke: Invoke) = gated(invoke) { askAddon(invoke, PushContract.MSG_GET_TOKEN) }

	@Command
	fun deleteToken(invoke: Invoke) = gated(invoke) { askAddon(invoke, PushContract.MSG_DELETE_TOKEN) }

	@Command
	fun notificationsEnabled(invoke: Invoke) =
		invoke.resolve(JSObject().apply { put("enabled", PushSettings.notificationsEnabled(activity)) })

	@Command
	fun setNotificationsEnabled(invoke: Invoke) {
		val enabled = invoke.parseArgs(EnabledArgs::class.java).enabled
		PushSettings.setNotificationsEnabled(activity, enabled)
		if (enabled) PushNotifier.createChannels(activity) else PushNotifier.cancelAll(activity)
		PushSchedule.follow(activity, PushSettings.mode(activity))
		invoke.resolve()
	}

	@Command
	fun openNotificationSettings(invoke: Invoke) =
		settingsOpened(invoke, PushNotifier.openAppNotificationSettings(activity))

	@Command
	fun mode(invoke: Invoke) =
		invoke.resolve(JSObject().apply { put("mode", PushSettings.mode(activity).wire) })

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
		withCategory(invoke, args.category) { kind ->
			PushSettings.setCategoryEnabled(activity, kind, args.enabled)
			if (!args.enabled) PushNotifier.cancelCategory(activity, kind)
			invoke.resolve()
		}
	}

	@Command
	fun openCategorySettings(invoke: Invoke) =
		withCategory(invoke, invoke.parseArgs(CategoryArgs::class.java).category) { kind ->
			PushNotifier.createChannels(activity)
			settingsOpened(invoke, PushNotifier.openChannelSettings(activity, kind))
		}

	@Command
	fun requestNotificationPermission(invoke: Invoke) {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || PushNotifier.notificationsPermitted(activity)) {
			return notificationPermission(invoke)
		}
		requestPermissionForAlias(NOTIFICATION_ALIAS, invoke, "notificationPermission")
	}

	@Command
	@PermissionCallback
	fun notificationPermission(invoke: Invoke) {
		val permitted = PushNotifier.notificationsPermitted(activity)
		val state = NotificationPermission.stateOf(
			sdk = Build.VERSION.SDK_INT,
			permitted = permitted,
			pluginState = getPermissionState(NOTIFICATION_ALIAS)?.toString(),
		)
		invoke.resolve(
			JSObject().apply {
				put("granted", permitted)
				put("state", state)
			},
		)
	}

	@Command
	fun watchPush(invoke: Invoke) {
		PushEvents.listen(invoke.parseArgs(WatchArgs::class.java).onEvent)
		invoke.resolve()
	}

	@Command
	fun takeDeeplink(invoke: Invoke) =
		invoke.resolve(JSObject().apply { put("deeplink", PushEvents.takeDeeplink()) })

	private fun offerDeeplink(intent: Intent?) {
		val deeplink = intent?.getStringExtra(PushNotifier.EXTRA_DEEPLINK) ?: return
		intent.removeExtra(PushNotifier.EXTRA_DEEPLINK)
		PushEvents.offerDeeplink(deeplink)
	}

	private fun gated(invoke: Invoke, run: () -> Unit) {
		when (AddonLaunchCheck.decideService(activity, PushContract.bindIntent(), PushContract.ADDON_PACKAGE)) {
			AddonGate.Verdict.Launch -> run()
			AddonGate.Verdict.Unavailable -> invoke.reject(PushContract.ERROR_UNAVAILABLE)
			AddonGate.Verdict.Disabled -> invoke.reject(PushContract.ERROR_DISABLED)
			AddonGate.Verdict.Untrusted -> invoke.reject(PushContract.ERROR_UNTRUSTED)
		}
	}

	private fun withCategory(invoke: Invoke, category: String, run: (PushKind) -> Unit) {
		val kind = PushCategories.kindOf(category) ?: return invoke.reject("unknown category")
		run(kind)
	}

	private fun settingsOpened(invoke: Invoke, opened: Boolean) =
		if (opened) invoke.resolve() else invoke.reject(ERROR_SETTINGS_UNAVAILABLE)

	private fun askAddon(invoke: Invoke, what: Int) {
		FcmRequest(activity, what) { outcome ->
			when (outcome) {
				is FcmOutcome.Token -> invoke.resolve(JSObject().apply { put("token", outcome.token) })
				FcmOutcome.Deleted -> invoke.resolve()
				is FcmOutcome.Failed -> invoke.reject(outcome.marker, outcome.detail)
			}
		}.send()
	}
}
