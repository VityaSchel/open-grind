package org.opengrind.push

object PushStrings {
	private val texts = mapOf(
		"SOMEONE_TITLE" to PushText.Someone,
		"TAP_NOTIFICATION_BODY" to PushText.Tap,
		"CHAT_IMAGE_NOTIFICATION_BODY" to PushText.Picture,
		"CHAT_LOCATION_NOTIFICATION_BODY" to PushText.Location,
		"CHAT_GIF_NOTIFICATION_BODY" to PushText.Gif,
		"CHAT_AUDIO_NOTIFICATION_BODY" to PushText.Audio,
		"CHAT_GAYMOJI_NOTIFICATION_BODY" to PushText.Gaymoji,
		"CHAT_EXPIRING_IMAGE_NOTIFICATION_BODY" to PushText.ExpiringImage,
		"CHAT_VIDEO_NOTIFICATION_BODY" to PushText.Video,
		"CHAT_ALBUM_NOTIFICATION_BODY" to PushText.Album,
		"CHAT_ALBUM_CONTENT_REACTION_NOTIFICATION_BODY" to PushText.AlbumReaction,
	)

	fun defaultBody(kind: PushKind): PushText = when (kind) {
		PushKind.Message -> PushText.Message
		PushKind.Tap -> PushText.Tap
	}

	fun resolve(
		value: String?,
		translate: String?,
		fallback: PushText,
		words: (PushText) -> String,
	): String? {
		if (value.isNullOrEmpty()) return null
		if (!translate.toBoolean()) return value
		return words(texts[value] ?: fallback)
	}
}
