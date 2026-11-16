package org.opengrind.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PushPreferencesTest {
	private fun installed(present: Boolean): () -> Boolean = { present }

	@Test
	fun `an existing Fast Mode user gets the add-on source without the UI ever loading`() {
		val store = MemoryPreferences("mode" to "fast")
		PushPreferences(store).migrateFastSource(installed(false))
		assertEquals(FastSource.Addon, PushPreferences(store).fastSource())
	}

	@Test
	fun `the migration looks up the add-on package itself`() {
		val withAddon = MemoryPreferences()
		PushPreferences(withAddon).migrateFastSource(installed(true))
		assertEquals(FastSource.Addon, PushPreferences(withAddon).fastSource())
		val without = MemoryPreferences()
		PushPreferences(without).migrateFastSource(installed(false))
		assertNull(PushPreferences(without).fastSource())
	}

	@Test
	fun `the migration runs once`() {
		val store = MemoryPreferences()
		PushPreferences(store).migrateFastSource(installed(false))
		val writes = store.writes
		var lookups = 0
		PushPreferences(store).migrateFastSource {
			lookups++
			true
		}
		assertNull(PushPreferences(store).fastSource())
		assertEquals(writes, store.writes)
		assertEquals(0, lookups)
	}

	@Test
	fun `the migration overwrites a source stored before the flag existed`() {
		val store = MemoryPreferences("fast_source" to "relay")
		PushPreferences(store).migrateFastSource(installed(false))
		assertNull(PushPreferences(store).fastSource())
	}

	@Test
	fun `the migration keeps the setting names existing installs read`() {
		val store = MemoryPreferences("mode" to "fast")
		PushPreferences(store).migrateFastSource(installed(false))
		assertEquals(mapOf("mode" to "fast", "fast_source" to "addon", "fast_source_migrated" to true), store.values)
	}

	@Test
	fun `clearing the source also falls back to Slow Mode`() {
		val store = MemoryPreferences("mode" to "fast", "fast_source" to "relay")
		PushPreferences(store).setFastSource(null)
		assertNull(PushPreferences(store).fastSource())
		assertEquals(PushMode.Slow, PushPreferences(store).mode())
		assertEquals(mapOf("mode" to "slow"), store.values)
	}

	@Test
	fun `setting a source keeps the mode`() {
		val store = MemoryPreferences("mode" to "fast")
		PushPreferences(store).setFastSource(FastSource.Relay)
		assertEquals(FastSource.Relay, PushPreferences(store).fastSource())
		assertEquals(PushMode.Fast, PushPreferences(store).mode())
	}

	@Test
	fun `dropping a source clears only the one it names`() {
		val store = MemoryPreferences("mode" to "fast", "fast_source" to "addon")
		assertFalse(PushPreferences(store).dropFastSource(FastSource.Relay))
		assertEquals(FastSource.Addon, PushPreferences(store).fastSource())
		assertEquals(PushMode.Fast, PushPreferences(store).mode())
		assertTrue(PushPreferences(store).dropFastSource(FastSource.Addon))
		assertNull(PushPreferences(store).fastSource())
		assertEquals(PushMode.Slow, PushPreferences(store).mode())
	}

	@Test
	fun `the mode is stored under its wire name`() {
		val store = MemoryPreferences()
		assertEquals(PushMode.Slow, PushPreferences(store).mode())
		PushPreferences(store).setMode(PushMode.Fast)
		assertEquals(mapOf("mode" to "fast"), store.values)
		assertEquals(PushMode.Fast, PushPreferences(store).mode())
	}
}
