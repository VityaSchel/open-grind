package org.opengrind.push

import android.content.Context

object PushSettings {
	private const val PREFERENCES = "org.opengrind.push"
	private const val MODE = "mode"
	private const val ENABLED = "notifications_enabled"
	private const val NONCE = "addon_nonce"
	private const val WATERMARK = "poll_watermark"
	private const val CATEGORY = "category_"

	fun mode(context: Context): PushMode =
		PushMode.of(preferences(context).getString(MODE, null))

	fun setMode(context: Context, mode: PushMode) {
		preferences(context).edit().putString(MODE, mode.wire).commit()
	}

	fun notificationsEnabled(context: Context): Boolean =
		preferences(context).getBoolean(ENABLED, false)

	fun setNotificationsEnabled(context: Context, enabled: Boolean) {
		preferences(context).edit().putBoolean(ENABLED, enabled).commit()
	}

	fun nonce(context: Context): String? = preferences(context).getString(NONCE, null)

	fun setNonce(context: Context, nonce: String) {
		preferences(context).edit().putString(NONCE, nonce).commit()
	}

	fun watermark(context: Context): Long = preferences(context).getLong(WATERMARK, 0L)

	fun setWatermark(context: Context, watermark: Long) {
		preferences(context).edit().putLong(WATERMARK, watermark).commit()
	}

	fun categoryEnabled(context: Context, kind: PushKind): Boolean =
		preferences(context).getBoolean(CATEGORY + PushCategories.wireOf(kind), true)

	fun setCategoryEnabled(context: Context, kind: PushKind, enabled: Boolean) {
		preferences(context)
			.edit()
			.putBoolean(CATEGORY + PushCategories.wireOf(kind), enabled)
			.commit()
	}

	private fun preferences(context: Context) =
		context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}
