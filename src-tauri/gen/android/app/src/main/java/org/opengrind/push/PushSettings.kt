package org.opengrind.push

import android.content.Context

object PushSettings {
	private const val PREFERENCES = "org.opengrind.push"
	private const val MODE = "mode"
	private const val ENABLED = "notifications_enabled"
	private const val NONCE = "addon_nonce"
	private const val INBOX_WATERMARK = "poll_watermark_inbox"
	private const val TAPS_WATERMARK = "poll_watermark_taps"
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

	fun watermarks(context: Context): Watermarks = preferences(context).let { stored ->
		Watermarks(
			inbox = stored.getLong(INBOX_WATERMARK, 0L),
			taps = stored.getLong(TAPS_WATERMARK, 0L),
		)
	}

	@Synchronized
	fun setWatermarks(context: Context, watermarks: Watermarks) {
		preferences(context)
			.edit()
			.putLong(INBOX_WATERMARK, watermarks.inbox)
			.putLong(TAPS_WATERMARK, watermarks.taps)
			.commit()
	}

	@Synchronized
	fun advanceWatermarks(context: Context, to: Watermarks) {
		setWatermarks(context, watermarks(context).newest(to))
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
