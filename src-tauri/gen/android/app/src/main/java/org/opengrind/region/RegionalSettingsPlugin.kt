package org.opengrind.region

import android.app.Activity
import android.app.LocaleManager
import android.content.res.Configuration
import android.content.res.Resources
import android.database.ContentObserver
import android.icu.util.LocaleData
import android.icu.util.ULocale
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.format.DateFormat
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.Locale

@InvokeArg
internal class WatchArgs {
	lateinit var onChange: Channel
}

@TauriPlugin
class RegionalSettingsPlugin(activity: Activity) : Plugin(activity) {
	private val context = activity.applicationContext
	private var watcher: Channel? = null
	private var lastSent: String? = null

	private val clockObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
		override fun onChange(selfChange: Boolean) = publish()
	}

	override fun load(webView: WebView) {
		context.contentResolver.registerContentObserver(
			Settings.System.getUriFor(Settings.System.TIME_12_24),
			false,
			clockObserver,
		)
	}

	override fun onResume() = publish()

	override fun onConfigurationChanged(newConfig: Configuration) = publish()

	@Command
	fun getRegionalSettings(invoke: Invoke) {
		invoke.resolve(snapshot())
	}

	@Command
	fun watchRegionalSettings(invoke: Invoke) {
		try {
			val channel = invoke.parseArgs(WatchArgs::class.java).onChange
			synchronized(this) {
				watcher = channel
				lastSent = snapshot().toString()
			}
			invoke.resolve()
		} catch (e: Exception) {
			invoke.reject("watch-failed")
		}
	}

	@Synchronized
	private fun publish() {
		val channel = watcher ?: return
		val settings = snapshot()
		val key = settings.toString()
		if (key == lastSent) return
		lastSent = key
		channel.send(settings)
	}

	private fun systemLocale(): Locale {
		val locales = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			context.getSystemService(LocaleManager::class.java).systemLocales
		} else {
			Resources.getSystem().configuration.locales
		}
		return locales.get(0) ?: Locale.getDefault()
	}

	private fun clockSetting(): String? =
		Settings.System.getString(context.contentResolver, Settings.System.TIME_12_24)

	private fun hourField(pattern: String): String? {
		var quoted = false
		for ((index, letter) in pattern.withIndex()) {
			if (letter == '\'') {
				quoted = !quoted
			} else if (!quoted && letter in HOUR_CYCLES) {
				return pattern.substring(index).takeWhile { it == letter }
			}
		}
		return null
	}

	private fun measurementSystem(locale: Locale): String =
		when (LocaleData.getMeasurementSystem(ULocale.forLocale(locale))) {
			LocaleData.MeasurementSystem.US -> "us"
			LocaleData.MeasurementSystem.UK -> "uk"
			else -> "metric"
		}

	private fun snapshot(): JSObject {
		val locale = systemLocale()
		val chosenClock = when (clockSetting()) {
			"24" -> "Hm"
			"12" -> "hm"
			else -> null
		}
		val hours = hourField(DateFormat.getBestDateTimePattern(locale, chosenClock ?: "jm"))
		return JSObject().apply {
			put("locale", locale.toLanguageTag())
			if (hours != null) {
				if (chosenClock != null) put("hourCycle", HOUR_CYCLES.getValue(hours[0]))
				put("twoDigitHour", hours.length >= 2)
			}
			locale.getUnicodeLocaleType("nu")?.let { put("numberingSystem", it) }
			val weekday = WEEKDAYS.indexOf(locale.getUnicodeLocaleType("fw") ?: "")
			if (weekday >= 0) put("firstDayOfWeek", weekday + 1)
			put("measurementSystem", measurementSystem(locale))
		}
	}

	private companion object {
		val WEEKDAYS = listOf("mon", "tue", "wed", "thu", "fri", "sat", "sun")
		val HOUR_CYCLES = mapOf('K' to "h11", 'h' to "h12", 'H' to "h23", 'k' to "h24")
	}
}
