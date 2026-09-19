package org.opengrind.push

import android.content.Context

object PushSettings {
	private const val PREFERENCES = "org.opengrind.push"
	private const val MODE = "mode"
	private const val NONCE = "addon_nonce"
	private const val WATERMARK = "poll_watermark"

	fun mode(context: Context): PushMode =
		PushMode.of(preferences(context).getString(MODE, null))

	fun setMode(context: Context, mode: PushMode) {
		preferences(context).edit().putString(MODE, mode.wire).commit()
	}

	fun nonce(context: Context): String? = preferences(context).getString(NONCE, null)

	fun setNonce(context: Context, nonce: String) {
		preferences(context).edit().putString(NONCE, nonce).commit()
	}

	fun watermark(context: Context): Long = preferences(context).getLong(WATERMARK, 0L)

	fun setWatermark(context: Context, watermark: Long) {
		preferences(context).edit().putLong(WATERMARK, watermark).commit()
	}

	private fun preferences(context: Context) =
		context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}
