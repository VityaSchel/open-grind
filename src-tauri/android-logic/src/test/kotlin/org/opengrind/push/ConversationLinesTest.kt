package org.opengrind.push

import org.junit.Assert.assertEquals
import org.junit.Test
import org.opengrind.push.ConversationLines.Line

class ConversationLinesTest {
	private fun line(key: String, timestamp: Long) = Line(key, "text $key", timestamp)

	private fun conversation(size: Int) = (1..size).map { line("m$it", it * 1_000L) }

	@Test
	fun `the first message of a conversation becomes its only line`() {
		assertEquals(listOf(line("m1", 1_000)), ConversationLines.append(emptyList(), line("m1", 1_000)))
	}

	@Test
	fun `a new message is added after the ones already shown`() {
		val lines = ConversationLines.append(conversation(2), line("m3", 3_000))
		assertEquals(listOf("m1", "m2", "m3"), lines.map(Line::dedupeKey))
	}

	@Test
	fun `a message delivered twice is shown once and leaves the conversation unchanged`() {
		val shown = conversation(3)
		val lines = ConversationLines.append(shown, line("m2", 9_000))
		assertEquals(shown, lines)
	}

	@Test
	fun `a message that arrives late is placed by its timestamp`() {
		val lines = ConversationLines.append(
			listOf(line("m1", 1_000), line("m3", 3_000)),
			line("m2", 2_000),
		)
		assertEquals(listOf("m1", "m2", "m3"), lines.map(Line::dedupeKey))
	}

	@Test
	fun `messages sharing a timestamp keep their arrival order`() {
		val lines = ConversationLines.append(listOf(line("first", 1_000)), line("second", 1_000))
		assertEquals(listOf("first", "second"), lines.map(Line::dedupeKey))
	}

	@Test
	fun `a full conversation drops its oldest line to make room`() {
		val lines = ConversationLines.append(conversation(ConversationLines.LIMIT), line("new", 99_000))
		assertEquals(ConversationLines.LIMIT, lines.size)
		assertEquals("m2", lines.first().dedupeKey)
		assertEquals("new", lines.last().dedupeKey)
	}

	@Test
	fun `a full conversation ignores a message older than everything it shows`() {
		val shown = conversation(ConversationLines.LIMIT)
		assertEquals(shown, ConversationLines.append(shown, line("stale", 0)))
	}

	@Test
	fun `an unsent message is removed and the rest stay in order`() {
		val lines = ConversationLines.remove(conversation(3), "m2")
		assertEquals(listOf("m1", "m3"), lines.map(Line::dedupeKey))
	}

	@Test
	fun `removing a message the conversation does not show changes nothing`() {
		val shown = conversation(3)
		assertEquals(shown, ConversationLines.remove(shown, "elsewhere"))
	}

	@Test
	fun `removing the only line leaves the conversation empty`() {
		assertEquals(emptyList<Line>(), ConversationLines.remove(conversation(1), "m1"))
	}
}
