package org.opengrind.push

import java.net.URLDecoder

enum class PushKind {
	Message,
	Tap,
}

sealed interface PushDecision {
	data class Notify(
		val kind: PushKind,
		val dedupeKey: String,
		val groupKey: String?,
		val title: String,
		val body: String,
		val imageUrl: String?,
		val deeplink: String,
		val senderId: String?,
		val timestamp: Long,
	) : PushDecision

	data class DismissSender(val senderIds: List<String>) : PushDecision

	data class DismissNotification(val dedupeKey: String) : PushDecision

	data object Ignore : PushDecision
}

object PushPayload {
	const val CONVERSATION_DEEPLINK = "grindr://conversation"
	const val TAPS_DEEPLINK = "grindr://taps-inbox"

	private const val VERSION_2 = "2"
	private const val DEEPLINK_PREFIX = "grindr://"
	private const val CLEAR_DEEPLINK = "grindr://clear"
	private const val UNSEND_DEEPLINK = "grindr://unsend"

	private const val CHATS_CHANNEL = "id_grindr_notifications_channel_individual_v2"
	private const val TAPS_CHANNEL = "id_grindr_notifications_channel_tap_v2"

	private const val DIRECT_CAMPAIGN = "_DIRECT"

	private val trackingKeys = listOf("_ab", "af-uinstall-tracking")
	private val campaignKeys = listOf("campaignId", "pinpoint.campaign.campaign_id")

	fun decide(data: Map<String, String>, fallbackTimestamp: Long): PushDecision {
		if (isCampaign(data)) return PushDecision.Ignore
		if (data["version"] != VERSION_2) return PushDecision.Ignore

		val action = data["action"].orEmpty()
		if (!action.startsWith(DEEPLINK_PREFIX, ignoreCase = true)) return PushDecision.Ignore
		val target = action.substringBefore('?').trimEnd('/').lowercase()

		if (target == CLEAR_DEEPLINK) return dismissSender(action)
		if (target == UNSEND_DEEPLINK) return dismissNotification(action)

		val kind = kindOf(target, data["channel"]) ?: return PushDecision.Ignore
		val notificationId = data["notificationId"].orEmpty()
		val body = PushStrings.resolve(
			data["body"],
			data["translateBody"],
			PushStrings.defaultBody(kind),
		)
		if (notificationId.isEmpty() || body == null) return PushDecision.Ignore

		return PushDecision.Notify(
			kind = kind,
			dedupeKey = notificationId,
			groupKey = queryParameter(action, "id"),
			title = PushStrings.resolve(
				data["title"],
				data["translateTitle"],
				PushStrings.SOMEONE,
			) ?: PushStrings.SOMEONE,
			body = body,
			imageUrl = data["imageUrl"]?.takeIf(String::isNotBlank),
			deeplink = action,
			senderId = data["senderId"]?.takeIf(String::isNotBlank),
			timestamp = data["timestamp"]?.toLongOrNull() ?: fallbackTimestamp,
		)
	}

	private fun isCampaign(data: Map<String, String>): Boolean =
		trackingKeys.any(data::containsKey) ||
			campaignKeys.any { key -> data[key]?.let { it != DIRECT_CAMPAIGN } == true }

	fun queryParameter(action: String, name: String): String? =
		action.substringAfter('?', "")
			.split('&')
			.firstOrNull { it.substringBefore('=') == name }
			?.substringAfter('=', "")
			?.let { runCatching { URLDecoder.decode(it, "UTF-8") }.getOrDefault(it) }
			?.takeIf(String::isNotEmpty)

	private fun kindOf(target: String, channel: String?): PushKind? = when {
		target == CONVERSATION_DEEPLINK || channel == CHATS_CHANNEL -> PushKind.Message
		target == TAPS_DEEPLINK || channel == TAPS_CHANNEL -> PushKind.Tap
		else -> null
	}

	private fun dismissSender(action: String): PushDecision {
		val senderIds = queryParameter(action, "profileIds")
			.orEmpty()
			.split(",")
			.map(String::trim)
			.filter(String::isNotEmpty)
		return if (senderIds.isEmpty()) PushDecision.Ignore else PushDecision.DismissSender(senderIds)
	}

	private fun dismissNotification(action: String): PushDecision {
		val id = queryParameter(action, "notificationId")
		return if (id == null) PushDecision.Ignore else PushDecision.DismissNotification(id)
	}
}
