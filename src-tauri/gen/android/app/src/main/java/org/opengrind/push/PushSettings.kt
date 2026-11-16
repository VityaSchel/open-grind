package org.opengrind.push

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

object PushSettings {
	private const val PREFERENCES = "org.opengrind.push"
	private const val ENABLED = "notifications_enabled"
	private const val NONCE = "addon_nonce"
	private const val WATERMARK = "poll_watermark_inbox"
	private const val CATEGORY = "category_"

	fun mode(context: Context): PushMode = pushPreferences(context).mode()

	fun setMode(context: Context, mode: PushMode) = pushPreferences(context).setMode(mode)

	fun fastSource(context: Context): FastSource? = pushPreferences(context).fastSource()

	@Synchronized
	fun setFastSource(context: Context, source: FastSource?) = pushPreferences(context).setFastSource(source)

	@Synchronized
	fun dropFastSource(context: Context, source: FastSource): Boolean = pushPreferences(context).dropFastSource(source)

	@Synchronized
	fun migrateFastSource(context: Context) = pushPreferences(context).migrateFastSource { addonInstalled(context) }

	fun notificationsEnabled(context: Context): Boolean =
		preferences(context).getBoolean(ENABLED, false)

	fun setNotificationsEnabled(context: Context, enabled: Boolean) {
		preferences(context).edit().putBoolean(ENABLED, enabled).commit()
	}

	fun nonce(context: Context): String? = preferences(context).getString(NONCE, null)

	fun setNonce(context: Context, nonce: String) {
		preferences(context).edit().putString(NONCE, nonce).commit()
	}

	fun watermark(context: Context): Watermark =
		Watermark(preferences(context).getLong(WATERMARK, 0L))

	@Synchronized
	fun setWatermark(context: Context, watermark: Watermark) {
		preferences(context).edit().putLong(WATERMARK, watermark.at).commit()
	}

	@Synchronized
	fun advanceWatermark(context: Context, to: Watermark) {
		setWatermark(context, watermark(context).newest(to))
	}

	fun categoryEnabled(context: Context, kind: PushKind): Boolean =
		preferences(context).getBoolean(CATEGORY + PushCategories.wireOf(kind), true)

	fun setCategoryEnabled(context: Context, kind: PushKind, enabled: Boolean) {
		preferences(context)
			.edit()
			.putBoolean(CATEGORY + PushCategories.wireOf(kind), enabled)
			.commit()
	}

	private fun addonInstalled(context: Context): Boolean = try {
		val packageManager = context.packageManager
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			packageManager.getApplicationInfo(PushContract.ADDON_PACKAGE, PackageManager.ApplicationInfoFlags.of(0L))
		} else {
			@Suppress("DEPRECATION")
			packageManager.getApplicationInfo(PushContract.ADDON_PACKAGE, 0)
		}
		true
	} catch (e: PackageManager.NameNotFoundException) {
		false
	}

	private fun pushPreferences(context: Context) = PushPreferences(SharedPreferenceStore(preferences(context)))

	private fun preferences(context: Context) =
		context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}
