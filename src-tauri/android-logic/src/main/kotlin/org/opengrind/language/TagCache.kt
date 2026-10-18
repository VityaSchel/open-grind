package org.opengrind.language

import java.util.Locale

class TagCache<T : Any> {
	@Volatile
	private var cached: Pair<String, T>? = null

	fun of(tag: String?, build: (Locale) -> T): T? {
		if (tag == null) return null
		cached?.takeIf { it.first == tag }?.let { return it.second }
		val locale = LanguageTags.localeOf(tag) ?: return null
		return build(locale).also { cached = tag to it }
	}
}
