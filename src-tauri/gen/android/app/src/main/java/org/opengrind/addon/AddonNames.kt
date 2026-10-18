package org.opengrind.addon

import androidx.annotation.StringRes
import org.opengrind.R

data class AddonTitles(
	@StringRes val install: Int,
	@StringRes val update: Int,
)

object AddonNames {
	private val unknown = AddonTitles(
		install = R.string.update_transfer_title,
		update = R.string.update_transfer_title,
	)

	fun titlesOf(addonPackage: String?): AddonTitles = when (addonPackage) {
		"org.opengrind.google_oauth" -> AddonTitles(
			install = R.string.addon_install_transfer_title_google_oauth,
			update = R.string.addon_update_transfer_title_google_oauth,
		)
		"org.opengrind.recaptcha" -> AddonTitles(
			install = R.string.addon_install_transfer_title_recaptcha,
			update = R.string.addon_update_transfer_title_recaptcha,
		)
		"org.opengrind.fcm" -> AddonTitles(
			install = R.string.addon_install_transfer_title_fcm,
			update = R.string.addon_update_transfer_title_fcm,
		)
		else -> unknown
	}
}
