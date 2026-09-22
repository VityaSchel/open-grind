package org.opengrind.push

object ConversationLines {
	const val LIMIT = 8

	data class Line(val dedupeKey: String, val text: String, val timestamp: Long)

	fun append(lines: List<Line>, line: Line): List<Line> {
		if (lines.any { it.dedupeKey == line.dedupeKey }) return lines
		return (lines + line).sortedBy(Line::timestamp).takeLast(LIMIT)
	}

	fun remove(lines: List<Line>, dedupeKey: String): List<Line> =
		lines.filterNot { it.dedupeKey == dedupeKey }
}
