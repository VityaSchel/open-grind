package org.opengrind.push

object PushStrings {
	const val SOMEONE = "Someone"

	private val translations = mapOf(
		"SOMEONE_TITLE" to SOMEONE,
		"TAP_NOTIFICATION_BODY" to "Tapped you",
		"CHAT_IMAGE_NOTIFICATION_BODY" to "Sent you a picture",
		"CHAT_LOCATION_NOTIFICATION_BODY" to "Sent you their location",
		"CHAT_GIF_NOTIFICATION_BODY" to "Sent you a GIF",
		"CHAT_AUDIO_NOTIFICATION_BODY" to "Sent you an audio message",
		"CHAT_GAYMOJI_NOTIFICATION_BODY" to "Sent you a Gaymoji",
		"CHAT_EXPIRING_IMAGE_NOTIFICATION_BODY" to "Sent you an expiring image",
		"CHAT_VIDEO_NOTIFICATION_BODY" to "Sent you a video",
		"CHAT_ALBUM_NOTIFICATION_BODY" to "Shared their album",
		"CHAT_ALBUM_CONTENT_REACTION_NOTIFICATION_BODY" to "Liked your album content",
	)

	fun defaultBody(kind: PushKind): String = when (kind) {
		PushKind.Message -> "Sent you a message"
		PushKind.Tap -> "Tapped you"
	}

	fun resolve(value: String?, translate: String?, fallback: String): String? {
		if (value.isNullOrEmpty()) return null
		if (!translate.toBoolean()) return value
		return translations[value] ?: fallback
	}
}
