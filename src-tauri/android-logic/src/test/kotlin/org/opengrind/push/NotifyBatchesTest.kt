package org.opengrind.push

import org.junit.Assert.assertEquals
import org.junit.Test

class NotifyBatchesTest {
	private fun message(conversation: String, key: String, timestamp: Long) = PushDecision.Notify(
		kind = PushKind.Message,
		dedupeKey = key,
		groupKey = conversation,
		title = "Viktor",
		body = "text $key",
		deeplink = "grindr://conversation?id=$conversation",
		senderId = "222",
		timestamp = timestamp,
	)

	private fun tap(key: String) = message("", key, 1_000).copy(kind = PushKind.Tap, groupKey = null)

	private fun keys(batches: List<List<PushDecision.Notify>>) = batches.map { batch -> batch.map { it.dedupeKey } }

	@Test
	fun `every line one check brings for a chat is posted together`() {
		val batches = NotifyBatches.of(
			listOf(
				message("1:2", "a1", 1_000),
				message("1:3", "b1", 1_500),
				message("1:2", "a2", 2_000),
			),
		)
		assertEquals(listOf(listOf("a1", "a2"), listOf("b1")), keys(batches))
	}

	@Test
	fun `every tap stays its own notification`() {
		val batches = NotifyBatches.of(listOf(tap("t1"), message("1:2", "a1", 1_000), tap("t2")))
		assertEquals(listOf(listOf("t1"), listOf("a1"), listOf("t2")), keys(batches))
	}

	@Test
	fun `withdrawals and ignored payloads post nothing`() {
		val batches = NotifyBatches.of(
			listOf(
				PushDecision.DismissNotification("a1"),
				PushDecision.DismissConversation("1:2"),
				PushDecision.Ignore,
				message("1:2", "a2", 2_000),
			),
		)
		assertEquals(listOf(listOf("a2")), keys(batches))
	}

	@Test
	fun `a single push is a batch of one`() {
		assertEquals(listOf(listOf("a1")), keys(NotifyBatches.of(listOf(message("1:2", "a1", 1_000)))))
	}
}
