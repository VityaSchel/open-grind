package org.opengrind.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle

class PushReceiver : BroadcastReceiver() {
	override fun onReceive(context: Context, intent: Intent) {
		if (PushSettings.mode(context) != PushMode.Fast) return
		if (!sentByAddon(context, intent)) return
		when (intent.action) {
			PushContract.ACTION_MESSAGE -> deliver(context, intent)
			PushContract.ACTION_NEW_TOKEN -> PushEvents.notifyTokenChanged()
		}
	}

	private fun sentByAddon(context: Context, intent: Intent): Boolean {
		val known = PushSettings.nonce(context) ?: return false
		return intent.getStringExtra(PushContract.EXTRA_NONCE) == known
	}

	private fun deliver(context: Context, intent: Intent) {
		val data = intent.getBundleExtra(PushContract.EXTRA_DATA) ?: return
		val sentTime = intent.getLongExtra(
			PushContract.EXTRA_SENT_TIME,
			System.currentTimeMillis(),
		)
		val decision = PushPayload.decide(data.toStringMap(), sentTime)
		if (decision is PushDecision.Notify && AppForeground.visible()) return
		PushNotifier.apply(context, decision)
	}

	private fun Bundle.toStringMap(): Map<String, String> =
		keySet().mapNotNull { key -> getString(key)?.let { key to it } }.toMap()
}
