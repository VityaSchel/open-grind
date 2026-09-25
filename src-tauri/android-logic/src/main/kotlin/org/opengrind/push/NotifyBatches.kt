package org.opengrind.push

object NotifyBatches {
	fun of(decisions: List<PushDecision>): List<List<PushDecision.Notify>> =
		decisions
			.filterIsInstance<PushDecision.Notify>()
			.groupBy { it.kind to it.postedId }
			.values
			.toList()
}
