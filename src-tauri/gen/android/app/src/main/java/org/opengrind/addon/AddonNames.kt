package org.opengrind.addon

import org.opengrind.R

object AddonNames {
	fun resourceOf(addonPackage: String?): Int = when (addonPackage) {
		"org.opengrind.google_oauth" -> R.string.addon_name_google_oauth
		"org.opengrind.recaptcha" -> R.string.addon_name_recaptcha
		"org.opengrind.fcm" -> R.string.addon_name_fcm
		else -> R.string.addon_name_generic
	}
}
