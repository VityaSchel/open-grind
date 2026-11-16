package org.opengrind.push

class PushPreferences(private val store: PreferenceStore) {
	fun mode(): PushMode = PushMode.of(store.string(MODE))

	fun setMode(mode: PushMode) = store.edit { putString(MODE, mode.wire) }

	fun fastSource(): FastSource? = FastSource.of(store.string(FAST_SOURCE))

	fun setFastSource(source: FastSource?) = store.edit {
		if (source == null) {
			remove(FAST_SOURCE)
			putString(MODE, PushMode.Slow.wire)
		} else {
			putString(FAST_SOURCE, source.wire)
		}
	}

	fun dropFastSource(source: FastSource): Boolean {
		if (fastSource() != source) return false
		setFastSource(null)
		return true
	}

	fun migrateFastSource(addonInstalled: () -> Boolean) {
		if (store.boolean(FAST_SOURCE_MIGRATED, fallback = false)) return
		val migrated = migratedFastSource(mode(), addonInstalled = addonInstalled())
		store.edit {
			if (migrated == null) remove(FAST_SOURCE) else putString(FAST_SOURCE, migrated.wire)
			putBoolean(FAST_SOURCE_MIGRATED, true)
		}
	}

	private companion object {
		const val MODE = "mode"
		const val FAST_SOURCE = "fast_source"
		const val FAST_SOURCE_MIGRATED = "fast_source_migrated"
	}
}
