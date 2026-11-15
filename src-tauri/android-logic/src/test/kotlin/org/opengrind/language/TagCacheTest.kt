package org.opengrind.language

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TagCacheTest {
	private val built = mutableListOf<String>()
	private val cache = TagCache<String>()

	private fun of(tag: String?): String? = cache.of(tag) { locale ->
		built += locale.toLanguageTag()
		"text in ${locale.toLanguageTag()}"
	}

	@Test
	fun `no stored tag builds nothing`() {
		assertNull(of(null))
		assertEquals(emptyList<String>(), built)
	}

	@Test
	fun `an ill-formed tag builds nothing`() {
		assertNull(of("en_US"))
		assertEquals(emptyList<String>(), built)
	}

	@Test
	fun `a stored tag builds its own locale`() {
		assertEquals("text in es-419", of("es-419"))
		assertEquals(listOf("es-419"), built)
	}

	@Test
	fun `the same tag reuses what it built`() {
		of("zh-Hans")
		assertEquals("text in zh-Hans", of("zh-Hans"))
		assertEquals(listOf("zh-Hans"), built)
	}

	@Test
	fun `a new tag replaces what the previous one built`() {
		of("de")
		assertEquals("text in fr", of("fr"))
		assertEquals("text in de", of("de"))
		assertEquals(listOf("de", "fr", "de"), built)
	}

	@Test
	fun `an ill-formed tag is never served what a good one built`() {
		of("de")
		assertNull(of("x"))
		assertNull(of(null))
		assertEquals(listOf("de"), built)
	}
}
