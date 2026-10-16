package org.opengrind.push

import android.content.Context
import androidx.annotation.StringRes
import org.opengrind.R
import org.opengrind.language.NativeLanguage

object PushWords {
	fun of(context: Context): (PushText) -> String {
		val localized = NativeLanguage.localized(context)
		return { text -> localized.getString(resourceOf(text)) }
	}

	@StringRes
	private fun resourceOf(text: PushText): Int = when (text) {
		PushText.Someone -> R.string.push_someone
		PushText.Message -> R.string.push_body_message
		PushText.Picture -> R.string.push_body_picture
		PushText.ExpiringImage -> R.string.push_body_expiring_image
		PushText.Album -> R.string.push_body_album
		PushText.AlbumReaction -> R.string.push_body_album_reaction
		PushText.Audio -> R.string.push_body_audio
		PushText.Video -> R.string.push_body_video
		PushText.Gaymoji -> R.string.push_body_gaymoji
		PushText.Gif -> R.string.push_body_gif
		PushText.Location -> R.string.push_body_location
		PushText.Tap -> R.string.push_body_tap
	}
}
