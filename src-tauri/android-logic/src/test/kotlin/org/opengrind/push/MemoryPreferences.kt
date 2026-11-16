package org.opengrind.push

class MemoryPreferences(vararg initial: Pair<String, Any>) : PreferenceStore {
	val values = linkedMapOf(*initial)
	var writes = 0
		private set

	override val keys: Set<String>
		get() = values.keys.toSet()

	override fun string(key: String): String? = values[key] as String?

	override fun long(key: String, fallback: Long): Long = values[key] as Long? ?: fallback

	override fun boolean(key: String, fallback: Boolean): Boolean = values[key] as Boolean? ?: fallback

	override fun strings(key: String): Set<String> =
		(values[key] as Set<*>?).orEmpty().map { it as String }.toSet()

	override fun contains(key: String): Boolean = key in values

	override fun edit(changes: PreferenceEdit.() -> Unit) {
		val staged = linkedMapOf<String, Any?>()
		Staging(staged).changes()
		for ((key, value) in staged) {
			if (value == null) values.remove(key) else values[key] = value
		}
		writes++
	}

	private class Staging(private val staged: MutableMap<String, Any?>) : PreferenceEdit {
		override fun putString(key: String, value: String) {
			staged[key] = value
		}

		override fun putLong(key: String, value: Long) {
			staged[key] = value
		}

		override fun putBoolean(key: String, value: Boolean) {
			staged[key] = value
		}

		override fun putStrings(key: String, values: Set<String>) {
			staged[key] = values.toSet()
		}

		override fun remove(key: String) {
			staged[key] = null
		}
	}
}
