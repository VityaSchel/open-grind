package org.opengrind.update

enum class TransferTitle {
	AppUpdate,
	AddonInstall,
	AddonUpdate,
	MediaUpload,
	;

	companion object {
		private const val FIRST_INSTALL = "install"
		const val MEDIA_UPLOAD = "mediaUpload"

		fun of(
			updatesThisApp: Boolean,
			kind: String?,
			purpose: String? = null,
		): TransferTitle =
			when {
				purpose == MEDIA_UPLOAD -> MediaUpload
				updatesThisApp -> AppUpdate
				kind == FIRST_INSTALL -> AddonInstall
				else -> AddonUpdate
			}

		fun named(name: String?): TransferTitle = entries.firstOrNull { it.name == name } ?: AppUpdate
	}
}
