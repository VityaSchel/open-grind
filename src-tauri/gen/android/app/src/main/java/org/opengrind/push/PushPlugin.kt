package org.opengrind.push

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.WebView
import androidx.activity.result.ActivityResult
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
import org.json.JSONObject
import org.opengrind.addon.AddonGate
import org.opengrind.addon.AddonLaunchCheck
import org.opengrind.launchForResult
import org.unifiedpush.android.connector.UnifiedPush

private const val NOTIFICATION_ALIAS = "postNotification"
private const val ERROR_SETTINGS_UNAVAILABLE = "settings-unavailable"
private const val ERROR_UNKNOWN_SOURCE = "unknown source"
private const val PLAY_SERVICES_PACKAGE = "com.google.android.gms"

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

@InvokeArg
internal class ConversationArgs {
	lateinit var conversationId: String
	var dedupeKey: String? = null
}

@InvokeArg
internal class SourceArgs {
	var source: String? = null
}

@InvokeArg
internal class CommitArgs {
	lateinit var code: String
	lateinit var profileId: String
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
		runCatching { RelaySetup.cancel(activity.applicationContext) }
		runCatching { noticeMissingDistributor() }
		runCatching { resumeOrphanCleanup() }
		runCatching { PushSchedule.follow(activity, PushSettings.mode(activity)) }
	}

	override fun onNewIntent(intent: Intent) = offerDeeplink(intent)

	override fun onResume() = RelaySetup.resumed()

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
	fun dismissConversation(invoke: Invoke) {
		val args = invoke.parseArgs(ConversationArgs::class.java)
		PushNotifier.dismissConversation(activity, args.conversationId, args.dedupeKey)
		invoke.resolve()
	}

	@Command
	fun shownConversations(invoke: Invoke) {
		val shown = PushNotifier.shownConversations(activity).map { it.conversationId }
		invoke.resolve(JSObject().apply { put("conversationIds", JSArray(shown)) })
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
		if (mode == PushMode.Fast && PushSettings.fastSource(activity) == null) {
			return invoke.reject(RelayContract.ERROR_FAST_UNCONFIGURED)
		}
		PushSettings.setMode(activity, mode)
		followMode(mode)
		invoke.resolve()
	}

	@Command
	fun fastSource(invoke: Invoke) {
		val source = PushSettings.fastSource(activity)
		invoke.resolve(JSObject().apply { put("source", source?.wire ?: JSONObject.NULL) })
	}

	@Command
	fun setFastSource(invoke: Invoke) {
		val wire = invoke.parseArgs(SourceArgs::class.java).source
		val source = FastSource.of(wire)
		if (wire != null && source == null) return invoke.reject(ERROR_UNKNOWN_SOURCE)
		if (source == FastSource.Relay && !RelayPairing.paired(activity)) {
			return invoke.reject(RelayContract.ERROR_UNPAIRED)
		}
		RelayJobService.cancel(activity)
		val wasFast = PushSettings.mode(activity) == PushMode.Fast
		PushSettings.setFastSource(activity, source)
		if (source == null && wasFast) followMode(PushMode.Slow)
		invoke.resolve()
	}

	@Command
	fun playServicesAvailable(invoke: Invoke) =
		invoke.resolve(JSObject().apply { put("available", installed(PLAY_SERVICES_PACKAGE)?.enabled == true) })

	@Command
	fun beginRelay(invoke: Invoke) = RelaySetup.begin(activity, invoke)

	@Command
	fun saveRelayConfig(invoke: Invoke) {
		val config = RelaySetup.config() ?: return invoke.reject(RelayContract.ERROR_NO_SETUP)
		try {
			activity.launchForResult(RelayConfigFile.saveIntent()) { result -> savePicked(invoke, result, config) }
		} catch (e: Exception) {
			invoke.reject(RelayContract.ERROR_SAVE_FAILED, e.javaClass.simpleName)
		}
	}

	@Command
	fun shareRelayConfig(invoke: Invoke) {
		val config = RelaySetup.config() ?: return invoke.reject(RelayContract.ERROR_NO_SETUP)
		try {
			activity.startActivity(RelayConfigFile.shareIntent(activity, config))
			invoke.resolve()
		} catch (e: Exception) {
			invoke.reject(RelayContract.ERROR_SHARE_FAILED, e.javaClass.simpleName)
		}
	}

	@Command
	fun awaitRelay(invoke: Invoke) = RelaySetup.await(invoke)

	@Command
	fun commitRelay(invoke: Invoke) {
		val args = invoke.parseArgs(CommitArgs::class.java)
		when (RelaySetup.commit(activity.applicationContext, args.code, args.profileId)) {
			RelayCommitResult.Matched -> invoke.resolve(JSObject().apply { put("matched", true) })
			RelayCommitResult.Mismatched -> invoke.resolve(JSObject().apply { put("matched", false) })
			RelayCommitResult.NoSetup -> invoke.reject(RelayContract.ERROR_NO_SETUP)
		}
	}

	@Command
	fun registerRelay(invoke: Invoke) {
		val context = activity.applicationContext
		RelayRegistration.later {
			when (RelayRegistration.register(context)) {
				RelayOutcome.Done -> invoke.resolve()
				RelayOutcome.Failed -> invoke.reject(RelayContract.ERROR_REGISTER_FAILED)
				RelayOutcome.AccountChanged -> invoke.reject(RelayContract.ERROR_ACCOUNT_CHANGED)
				RelayOutcome.Unpaired -> invoke.reject(RelayContract.ERROR_UNPAIRED)
			}
		}
	}

	@Command
	fun unregisterRelay(invoke: Invoke) {
		val context = activity.applicationContext
		RelayRegistration.later {
			when (RelayRegistration.unregisterAll(context)) {
				RelayOutcome.AccountChanged -> invoke.reject(RelayContract.ERROR_ACCOUNT_CHANGED)
				RelayOutcome.Done, RelayOutcome.Failed, RelayOutcome.Unpaired -> invoke.resolve()
			}
		}
	}

	@Command
	fun cancelRelay(invoke: Invoke) {
		RelaySetup.cancel(activity.applicationContext)
		invoke.resolve()
	}

	@Command
	fun forgetRelay(invoke: Invoke) {
		val context = activity.applicationContext
		RelayJobService.cancel(context)
		RelaySetup.cancel(context)
		RelayPairing.instance(context)?.let { committed ->
			runCatching { UnifiedPush.unregister(context, committed) }
		}
		if (RelayPairing.forget(context)) RelayJobService.scheduleOrphanCleanup(context)
		val wasFast = PushSettings.mode(context) == PushMode.Fast
		if (PushSettings.dropFastSource(context, FastSource.Relay) && wasFast) followMode(PushMode.Slow)
		invoke.resolve()
	}

	@Command
	fun dropOrphans(invoke: Invoke) {
		val context = activity.applicationContext
		RelayJobService.cancelOrphanCleanup(context)
		RelayPairing.dropOrphans(context)
		invoke.resolve()
	}

	@Command
	fun relayStatus(invoke: Invoke) {
		noticeMissingDistributor()
		invoke.resolve(
			JSObject().apply {
				put("paired", RelayPairing.paired(activity))
				put("broken", RelayPairing.broken(activity) != null)
			},
		)
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

	@Command
	fun deeplinkPending(invoke: Invoke) =
		invoke.resolve(JSObject().apply { put("pending", PushEvents.deeplinkPending()) })

	private fun offerDeeplink(intent: Intent?) {
		val deeplink = intent?.getStringExtra(PushNotifier.EXTRA_DEEPLINK) ?: return
		intent.removeExtra(PushNotifier.EXTRA_DEEPLINK)
		PushEvents.offerDeeplink(deeplink)
	}

	private fun gated(invoke: Invoke, run: () -> Unit) {
		when (
			AddonLaunchCheck.decideService(
				activity,
				PushContract.bindIntent(),
				PushContract.ADDON_PACKAGE,
				PushContract.MIN_ADDON_VERSION_CODE,
			)
		) {
			AddonGate.Verdict.Launch -> run()
			AddonGate.Verdict.Unavailable -> invoke.reject(PushContract.ERROR_UNAVAILABLE)
			AddonGate.Verdict.Disabled -> invoke.reject(PushContract.ERROR_DISABLED)
			AddonGate.Verdict.Untrusted -> invoke.reject(PushContract.ERROR_UNTRUSTED)
			AddonGate.Verdict.Hidden -> invoke.reject(PushContract.ERROR_HIDDEN)
			AddonGate.Verdict.TurnedOff -> invoke.reject(PushContract.ERROR_TURNED_OFF)
			AddonGate.Verdict.Outdated -> invoke.reject(PushContract.ERROR_OUTDATED)
		}
	}

	private fun followMode(mode: PushMode) {
		PushNotifier.createChannels(activity)
		if (mode != PushMode.Fast) PushNotifier.cancelAll(activity)
		PushSchedule.follow(activity, mode)
	}

	private fun savePicked(invoke: Invoke, result: ActivityResult, config: ByteArray) {
		val uri = result.data?.data
		if (result.resultCode != Activity.RESULT_OK || uri == null) {
			return invoke.resolve(JSObject().apply { put("saved", false) })
		}
		val context = activity.applicationContext
		Thread({
			try {
				RelayConfigFile.write(context, uri, config)
				invoke.resolve(JSObject().apply { put("saved", true) })
			} catch (e: Exception) {
				invoke.reject(RelayContract.ERROR_SAVE_FAILED, e.javaClass.simpleName)
			}
		}, "opengrind-relay-save").start()
	}

	private fun noticeMissingDistributor() {
		val committed = RelayPairing.instance(activity) ?: return
		if (!RelayPairing.paired(activity) || RelayPairing.broken(activity) != null) return
		if (UnifiedPush.getSavedDistributor(activity) == null) {
			RelayPairing.markBroken(activity, RelayBreak.DistributorGone, committed)
		}
	}

	private fun resumeOrphanCleanup() {
		if (RelayPairing.orphans(activity) != null) RelayJobService.scheduleOrphanCleanup(activity)
	}

	private fun installed(packageName: String): ApplicationInfo? = try {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			activity.packageManager.getApplicationInfo(packageName, PackageManager.ApplicationInfoFlags.of(0L))
		} else {
			@Suppress("DEPRECATION")
			activity.packageManager.getApplicationInfo(packageName, 0)
		}
	} catch (e: PackageManager.NameNotFoundException) {
		null
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
