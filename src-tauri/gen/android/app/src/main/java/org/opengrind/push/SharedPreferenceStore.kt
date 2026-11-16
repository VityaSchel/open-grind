package org.opengrind.push

import android.content.SharedPreferences

class SharedPreferenceStore(private val preferences: SharedPreferences) : PreferenceStore {
	override val keys: Set<String>
		get() = preferences.all.keys.toSet()

	override fun string(key: String): String? = preferences.getString(key, null)

	override fun long(key: String, fallback: Long): Long = preferences.getLong(key, fallback)

	override fun boolean(key: String, fallback: Boolean): Boolean = preferences.getBoolean(key, fallback)

	override fun strings(key: String): Set<String> = preferences.getStringSet(key, null)?.toSet().orEmpty()

	override fun contains(key: String): Boolean = preferences.contains(key)

	override fun edit(changes: PreferenceEdit.() -> Unit) {
		val editor = preferences.edit()
		EditorChanges(editor).changes()
		editor.commit()
	}

	private class EditorChanges(private val editor: SharedPreferences.Editor) : PreferenceEdit {
		override fun putString(key: String, value: String) {
			editor.putString(key, value)
		}

		override fun putLong(key: String, value: Long) {
			editor.putLong(key, value)
		}

		override fun putBoolean(key: String, value: Boolean) {
			editor.putBoolean(key, value)
		}

		override fun putStrings(key: String, values: Set<String>) {
			editor.putStringSet(key, values)
		}

		override fun remove(key: String) {
			editor.remove(key)
		}
	}
}
