package org.opengrind.language

import java.util.IllformedLocaleException
import java.util.Locale

object LanguageTags {
	fun localeOf(tag: String): Locale? {
		val locale = try {
			Locale.Builder().setLanguageTag(tag).build()
		} catch (e: IllformedLocaleException) {
			return null
		}
		return locale.takeIf { it.language.isNotEmpty() }
	}
}
