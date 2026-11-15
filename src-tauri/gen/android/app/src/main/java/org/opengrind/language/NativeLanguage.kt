package org.opengrind.language

import android.app.LocaleManager
import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import android.os.Build

object NativeLanguage {
	private const val PREFERENCES = "org.opengrind.language"
	private const val TAG = "tag"
	private const val SHOWN_UNDER = "shown_under"

	private val contexts = TagCache<Context>()

	fun remember(context: Context, tag: String?): Boolean =
		preferences(context).edit()
			.putString(TAG, tag)
			.putString(SHOWN_UNDER, androidLanguages(context))
			.commit()

	fun localized(context: Context): Context {
		val stored = preferences(context)
		if (stored.getString(SHOWN_UNDER, null) != androidLanguages(context)) return context
		val application = context.applicationContext
		return contexts.of(stored.getString(TAG, null)) { locale ->
			val configuration = Configuration(application.resources.configuration).apply {
				setLocale(locale)
			}
			application.createConfigurationContext(configuration)
		} ?: context
	}

	private fun androidLanguages(context: Context): String =
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			val manager = context.getSystemService(LocaleManager::class.java)
			"${manager.applicationLocales.toLanguageTags()};${manager.systemLocales.toLanguageTags()}"
		} else {
			Resources.getSystem().configuration.locales.toLanguageTags()
		}

	private fun preferences(context: Context) =
		context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}
