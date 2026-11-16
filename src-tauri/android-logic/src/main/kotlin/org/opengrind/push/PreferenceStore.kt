package org.opengrind.push

interface PreferenceStore {
	val keys: Set<String>

	fun string(key: String): String?

	fun long(key: String, fallback: Long): Long

	fun boolean(key: String, fallback: Boolean): Boolean

	fun strings(key: String): Set<String>

	operator fun contains(key: String): Boolean

	fun edit(changes: PreferenceEdit.() -> Unit)
}

interface PreferenceEdit {
	fun putString(key: String, value: String)

	fun putLong(key: String, value: Long)

	fun putBoolean(key: String, value: Boolean)

	fun putStrings(key: String, values: Set<String>)

	fun remove(key: String)
}
