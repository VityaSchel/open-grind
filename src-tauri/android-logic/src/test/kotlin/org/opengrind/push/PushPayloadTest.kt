package org.opengrind.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class PushPayloadTest {
	private val now = 1_700_000_000_000L

	private fun message(vararg extra: Pair<String, String>) = mapOf(
		"version" to "2",
		"notificationId" to "n-1",
		"channel" to "id_grindr_notifications_channel_individual_v2",
		"action" to "grindr://conversation?id=111%3A222&senderId=111",
		"title" to "Viktor",
		"body" to "hey",
		"senderId" to "111",
		"timestamp" to "1699999999000",
	) + extra

	private fun tap(vararg extra: Pair<String, String>) = message(
		"notificationId" to "poll:tap:222",
		"channel" to "id_grindr_notifications_channel_tap_v2",
		"action" to "grindr://taps-inbox",
		"body" to "TAP_NOTIFICATION_BODY",
		"translateBody" to "true",
		"senderId" to "222",
		*extra,
	)

	private fun readElsewhere(conversationId: String) = mapOf(
		"version" to "2",
		"notificationId" to "poll:clear:$conversationId",
		"action" to "grindr://clear?conversationId=$conversationId",
		"timestamp" to "1699999999000",
	)

	private fun decide(data: Map<String, String>) = PushPayload.decide(data, now)

	@Test
	fun `a direct message becomes a notification with its plaintext title and body`() {
		val decision = decide(message()) as PushDecision.Notify
		assertEquals(PushKind.Message, decision.kind)
		assertEquals("Viktor", decision.title)
		assertEquals("hey", decision.body)
		assertEquals("n-1", decision.dedupeKey)
		assertEquals("111:222", decision.groupKey)
		assertEquals("111", decision.senderId)
		assertEquals(1699999999000L, decision.timestamp)
	}

	@Test
	fun `a translated body renders the english string rather than its key`() {
		val decision = decide(
			message("body" to "CHAT_IMAGE_NOTIFICATION_BODY", "translateBody" to "true"),
		) as PushDecision.Notify
		assertEquals("Sent you a picture", decision.body)
	}

	@Test
	fun `a translation key open grind does not know falls back instead of leaking the key`() {
		val decision = decide(
			message("body" to "CHAT_FUTURE_NOTIFICATION_BODY", "translateBody" to "true"),
		) as PushDecision.Notify
		assertEquals("Sent you a message", decision.body)
	}

	@Test
	fun `translate flags follow parseBoolean, which ignores case and rejects everything else`() {
		val untranslated = decide(
			message("body" to "TAP_NOTIFICATION_BODY", "translateBody" to "1"),
		) as PushDecision.Notify
		assertEquals("TAP_NOTIFICATION_BODY", untranslated.body)

		val shouted = decide(
			message("body" to "TAP_NOTIFICATION_BODY", "translateBody" to "TRUE"),
		) as PushDecision.Notify
		assertEquals("Tapped you", shouted.body)
	}

	@Test
	fun `a missing title becomes someone`() {
		val decision = decide(message() - "title") as PushDecision.Notify
		assertEquals(PushStrings.SOMEONE, decision.title)
	}

	@Test
	fun `a tap is recognised by its channel and deeplink`() {
		val decision = decide(
			message(
				"channel" to "id_grindr_notifications_channel_tap_v2",
				"action" to "grindr://taps-inbox",
				"body" to "TAP_NOTIFICATION_BODY",
				"translateBody" to "true",
			),
		) as PushDecision.Notify
		assertEquals(PushKind.Tap, decision.kind)
		assertEquals("Tapped you", decision.body)
		assertEquals(null, decision.groupKey)
	}

	@Test
	fun `a clear push withdraws every notification from the named senders`() {
		val decision = decide(
			message("action" to "grindr://clear?profileIds=111,222"),
		) as PushDecision.DismissSender
		assertEquals(listOf("111", "222"), decision.senderIds)
	}

	@Test
	fun `a clear push naming a tapper still withdraws their tap`() {
		val decision = decide(
			tap("action" to "grindr://clear?profileIds=222"),
		) as PushDecision.DismissSender
		assertEquals(listOf("222"), decision.senderIds)
	}

	@Test
	fun `a chat read elsewhere withdraws only that chat, never the peer's taps`() {
		assertEquals(
			PushDecision.DismissConversation("111:222"),
			decide(readElsewhere("111:222")),
		)
	}

	@Test
	fun `a chat read elsewhere withdraws the very notification its messages were posted under`() {
		val posted = decide(message()) as PushDecision.Notify
		val cleared = decide(readElsewhere(posted.groupKey!!)) as PushDecision.DismissConversation
		assertEquals(posted.postedId, cleared.postedId)
	}

	@Test
	fun `messages share one notification per conversation while taps stay apart`() {
		val first = decide(message()) as PushDecision.Notify
		val second = decide(message("notificationId" to "n-2")) as PushDecision.Notify
		assertEquals(first.postedId, second.postedId)
		val firstTap = decide(tap()) as PushDecision.Notify
		val secondTap = decide(tap("notificationId" to "poll:tap:333")) as PushDecision.Notify
		assertFalse(firstTap.postedId == secondTap.postedId)
	}

	@Test
	fun `a clear push naming nobody is ignored`() {
		assertEquals(PushDecision.Ignore, decide(message("action" to "grindr://clear?profileIds=")))
	}

	@Test
	fun `an unsend push withdraws the one notification it names`() {
		val decision = decide(
			message("action" to "grindr://unsend?notificationId=n-9"),
		) as PushDecision.DismissNotification
		assertEquals("n-9", decision.dedupeKey)
	}

	@Test
	fun `an unsend naming a tap withdraws the very notification the tap was posted under`() {
		val posted = decide(tap()) as PushDecision.Notify
		val unsent = decide(
			message("action" to "grindr://unsend?notificationId=" + posted.dedupeKey),
		) as PushDecision.DismissNotification
		assertEquals(posted.postedId, unsent.tapPostedId)
	}

	@Test
	fun `marketing and tracking pushes never notify`() {
		assertEquals(PushDecision.Ignore, decide(message("_ab" to "true")))
		assertEquals(PushDecision.Ignore, decide(message("af-uinstall-tracking" to "1")))
		assertEquals(PushDecision.Ignore, decide(message("campaignId" to "summer-2026")))
		assertEquals(
			PushDecision.Ignore,
			decide(message("pinpoint.campaign.campaign_id" to "summer-2026")),
		)
	}

	@Test
	fun `a direct message still notifies though grindr stamps it with a campaign id`() {
		for (key in listOf("campaignId", "pinpoint.campaign.campaign_id")) {
			val decision = decide(message(key to "_DIRECT")) as PushDecision.Notify
			assertEquals("hey", decision.body)
		}
	}

	@Test
	fun `the payload grindr actually sends for a direct message is rendered`() {
		val live = mapOf(
			"titleArgs" to "[]",
			"action" to "grindr://conversation?id=852120758:858049792&senderId=852120758",
			"translateTitle" to "false",
			"imageUrl" to "https://cdns.grindr.com/images/thumb/320x320/abc",
			"body" to "payload dump 215032",
			"timestamp" to "1789674633707",
			"title" to "Viktor",
			"version" to "2",
			"pinpoint.campaign.campaign_id" to "_DIRECT",
			"translateBody" to "false",
			"channel" to "id_grindr_notifications_channel_individual_v2",
			"notificationId" to "4f7ebba2-1cc9-421a-9495-7263a38f0437",
			"senderId" to "852120758",
			"bodyArgs" to "[]",
		)
		val decision = PushPayload.decide(live, now) as PushDecision.Notify
		assertEquals(PushKind.Message, decision.kind)
		assertEquals("Viktor", decision.title)
		assertEquals("payload dump 215032", decision.body)
		assertEquals("4f7ebba2-1cc9-421a-9495-7263a38f0437", decision.dedupeKey)
		assertEquals("852120758:858049792", decision.groupKey)
		assertEquals("852120758", decision.senderId)
		assertEquals(1789674633707L, decision.timestamp)
	}

	@Test
	fun `push types open grind does not render yet are ignored`() {
		assertEquals(
			PushDecision.Ignore,
			decide(
				message(
					"channel" to "id_grindr_notifications_channel_fresh_albums",
					"action" to "grindr://fresh-albums?albumIds=1",
				),
			),
		)
	}

	@Test
	fun `payloads that are not version two are ignored`() {
		assertEquals(PushDecision.Ignore, decide(message("version" to "1")))
		assertEquals(PushDecision.Ignore, decide(message() - "version"))
	}

	@Test
	fun `an action outside the grindr scheme is ignored`() {
		assertEquals(PushDecision.Ignore, decide(message("action" to "https://evil.example/pwn")))
		assertEquals(PushDecision.Ignore, decide(message() - "action"))
	}

	@Test
	fun `a payload with no body or no notification id is ignored`() {
		assertEquals(PushDecision.Ignore, decide(message() - "body"))
		assertEquals(PushDecision.Ignore, decide(message("body" to "")))
		assertEquals(PushDecision.Ignore, decide(message() - "notificationId"))
	}

	@Test
	fun `a timestamp that is missing or unparseable falls back to now`() {
		assertEquals(now, (decide(message() - "timestamp") as PushDecision.Notify).timestamp)
		assertEquals(now, (decide(message("timestamp" to "soon")) as PushDecision.Notify).timestamp)
	}

	@Test
	fun `a push we cannot route is ignored even when it arrives on a channel we render`() {
		val decision = decide(
			message(
				"action" to "grindr://favorite-profile?profileID=852120758",
				"channel" to "id_grindr_notifications_channel_individual_v2",
				"body" to "Viktor is online",
			),
		)
		assertEquals(PushDecision.Ignore, decision)
	}
}
