package org.opengrind.push

object ConversationLines {
	const val LIMIT = 8

	data class Line(val dedupeKey: String, val text: String, val timestamp: Long)

	fun append(lines: List<Line>, added: List<Line>): List<Line> {
		val known = lines.mapTo(HashSet(), Line::dedupeKey)
		val fresh = added.filter { known.add(it.dedupeKey) }
		if (fresh.isEmpty()) return lines
		return (lines + fresh).sortedBy(Line::timestamp).takeLast(LIMIT)
	}

	fun remove(lines: List<Line>, dedupeKeys: Set<String>): List<Line> =
		lines.filterNot { it.dedupeKey in dedupeKeys }
}
