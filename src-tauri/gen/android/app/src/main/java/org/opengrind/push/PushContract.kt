package org.opengrind.push

import android.content.Intent

object PushContract {
	const val ADDON_PACKAGE = "org.opengrind.fcm"
	const val MIN_ADDON_VERSION_CODE = 1_000_001L

	const val ACTION_BIND = "org.opengrind.fcm.action.BIND"
	const val ACTION_MESSAGE = "org.opengrind.fcm.action.MESSAGE"
	const val ACTION_NEW_TOKEN = "org.opengrind.fcm.action.NEW_TOKEN"

	const val EXTRA_DATA = "org.opengrind.fcm.extra.DATA"
	const val EXTRA_NONCE = "org.opengrind.fcm.extra.NONCE"
	const val EXTRA_SENT_TIME = "org.opengrind.fcm.extra.SENT_TIME"
	const val EXTRA_ERROR = "org.opengrind.fcm.extra.ERROR"
	const val EXTRA_ERROR_DETAIL = "org.opengrind.fcm.extra.ERROR_DETAIL"
	const val EXTRA_TOKEN = "org.opengrind.fcm.extra.TOKEN"

	const val MSG_GET_TOKEN = 1
	const val MSG_DELETE_TOKEN = 2
	const val MSG_TOKEN = 101
	const val MSG_DELETED = 102
	const val MSG_ERROR = 103

	const val ERROR_UNAVAILABLE = "fcm-unavailable"
	const val ERROR_UNTRUSTED = "fcm-untrusted"
	const val ERROR_DISABLED = "fcm-disabled"
	const val ERROR_REFUSED = "fcm-refused"
	const val ERROR_TIMED_OUT = "fcm-timed-out"
	const val ERROR_OUTDATED = "fcm-outdated"
	const val ERROR_HIDDEN = "fcm-hidden"
	const val ERROR_TURNED_OFF = "fcm-turned-off"
	const val ERROR_BLOCKED = "fcm-blocked"

	fun bindIntent(): Intent = Intent(ACTION_BIND).setPackage(ADDON_PACKAGE)
}
