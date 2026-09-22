package org.opengrind.update

enum class TransferTitle {
	AppUpdate,
	GoogleOauthInstall,
	GoogleOauthUpdate,
	RecaptchaInstall,
	RecaptchaUpdate,
	MediaUpload,
	;

	enum class Addon {
		GoogleOauth,
		Recaptcha,
	}

	companion object {
		private const val FIRST_INSTALL = "install"
		const val MEDIA_UPLOAD = "mediaUpload"

		fun of(
			updatesThisApp: Boolean,
			addon: Addon?,
			kind: String?,
			purpose: String? = null,
		): TransferTitle {
			if (purpose == MEDIA_UPLOAD) return MediaUpload
			if (updatesThisApp || addon == null) return AppUpdate
			val firstInstall = kind == FIRST_INSTALL
			return when (addon) {
				Addon.GoogleOauth -> if (firstInstall) GoogleOauthInstall else GoogleOauthUpdate
				Addon.Recaptcha -> if (firstInstall) RecaptchaInstall else RecaptchaUpdate
			}
		}

		fun named(name: String?): TransferTitle = entries.firstOrNull { it.name == name } ?: AppUpdate
	}
}
