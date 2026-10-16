package org.opengrind.language

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LanguageTagsTest {
	private fun parts(tag: String): List<String>? =
		LanguageTags.localeOf(tag)?.let { listOf(it.language, it.script, it.country) }

	@Test
	fun `a numeric region parses`() {
		assertEquals(listOf("es", "", "419"), parts("es-419"))
	}

	@Test
	fun `a script parses`() {
		assertEquals(listOf("zh", "Hans", ""), parts("zh-Hans"))
	}

	@Test
	fun `a two-letter region parses`() {
		assertEquals(listOf("en", "", "US"), parts("en-US"))
	}

	@Test
	fun `an empty tag names no language`() {
		assertNull(LanguageTags.localeOf(""))
	}

	@Test
	fun `an underscored tag is ill-formed`() {
		assertNull(LanguageTags.localeOf("en_US"))
	}

	@Test
	fun `a bare private-use prefix is ill-formed`() {
		assertNull(LanguageTags.localeOf("x"))
	}

	@Test
	fun `a private-use tag names no language`() {
		assertNull(LanguageTags.localeOf("x-pseudo"))
	}
}
