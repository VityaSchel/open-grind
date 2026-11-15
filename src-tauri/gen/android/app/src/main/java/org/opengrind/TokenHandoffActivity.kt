package org.opengrind

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import org.opengrind.addon.AddonGate
import org.opengrind.addon.signingCertificates
import org.opengrind.disguise.Disguise
import org.opengrind.googleoauth.HandoffEvents
import org.opengrind.googleoauth.TokenHandoff

class TokenHandoffActivity : Activity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)

		val trusted = AddonGate.acceptsCaller(
			callingPackage = callingPackage,
			addonPackage = COMPANION_PACKAGE,
			certificates = packageManager.signingCertificates(),
		)
		val token = if (trusted) {
			intent?.getStringExtra(EXTRA_TOKEN).orEmpty()
		} else {
			""
		}
		if (token.isEmpty()) {
			setResult(RESULT_CANCELED)
			finish()
			return
		}

		TokenHandoff.offer(token, SystemClock.elapsedRealtime())
		HandoffEvents.notifyPending()
		setResult(RESULT_OK)
		startActivity(Disguise.launchIntent(this).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
		finish()
	}

	private companion object {
		const val COMPANION_PACKAGE = "org.opengrind.google_oauth"
		const val EXTRA_TOKEN = "org.opengrind.google_oauth.extra.TOKEN"
	}
}
