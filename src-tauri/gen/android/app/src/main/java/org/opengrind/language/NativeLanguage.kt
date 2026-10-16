package org.opengrind.language

import android.content.Context
import android.content.res.Configuration

object NativeLanguage {
	private const val PREFERENCES = "org.opengrind.language"
	private const val TAG = "tag"

	private val contexts = TagCache<Context>()

	fun remember(context: Context, tag: String?): Boolean =
		preferences(context).edit().putString(TAG, tag).commit()

	fun localized(context: Context): Context {
		val application = context.applicationContext
		return contexts.of(preferences(context).getString(TAG, null)) { locale ->
			val configuration = Configuration(application.resources.configuration).apply {
				setLocale(locale)
			}
			application.createConfigurationContext(configuration)
		} ?: context
	}

	private fun preferences(context: Context) =
		context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}
