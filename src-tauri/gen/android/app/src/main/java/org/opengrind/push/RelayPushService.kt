package org.opengrind.push

import android.content.Context
import java.util.concurrent.TimeUnit
import org.opengrind.push.relay.EndpointDigest
import org.opengrind.push.relay.RelayPush
import org.opengrind.push.relay.RelayResync
import org.opengrind.push.relay.SignedEnvelope
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage

class RelayPushService : PushService() {
	override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
		if (endpoint.temporary) return
		val context = applicationContext
		if (RelaySetup.endpointArrived(context, endpoint, instance)) return
		if (instance != RelayPairing.instance(context)) return
		val digest = endpoint.pubKeySet?.let { keys -> EndpointDigest.of(endpoint.url, keys.pubKey, keys.auth) }
		if (digest == null || digest != RelayPairing.endpointDigest(context)) {
			RelayPairing.markBroken(context, RelayBreak.EndpointChanged, instance)
		}
	}

	override fun onMessage(message: PushMessage, instance: String) {
		if (!message.decrypted) return
		val context = applicationContext
		if (RelaySetup.messageArrived(message.content, instance)) return
		if (instance != RelayPairing.instance(context)) return
		receive(context, instance, message.content)
	}

	override fun onRegistrationFailed(reason: FailedReason, instance: String) {
		RelaySetup.registrationFailed(applicationContext, reason, instance)
	}

	override fun onUnregistered(instance: String) {
		val context = applicationContext
		if (RelaySetup.unregistered(context, instance)) return
		RelayPairing.markBroken(context, RelayBreak.Unregistered, instance)
	}

	private fun receive(context: Context, instance: String, content: ByteArray) {
		if (RelayPairing.broken(context) != null) return
		val pinned = RelayPairing.relayKey(context) ?: return
		val envelope = SignedEnvelope.split(content) ?: return
		val message = envelope.message() ?: return
		if (!envelope.verifiedBy(pinned)) {
			if (message is RelayResync && message.relayKey != pinned && envelope.verifiedBy(message.relayKey)) {
				RelayPairing.markBroken(context, RelayBreak.RelayKeyChanged, instance, relayKeyHex = pinned.hex)
			}
			return
		}
		if (RelayPairing.seenBefore(context, envelope.signatureHex())) return
		when (message) {
			is RelayPush -> notify(context, message)
			is RelayResync -> resync(context, instance, message)
		}
	}

	private fun notify(context: Context, push: RelayPush) {
		if (!relaying(context)) return
		val decision = PushPayload.decide(push.data, TimeUnit.SECONDS.toMillis(push.ts), PushWords.of(context))
		if (decision is PushDecision.Notify && AppForeground.visible()) return
		PushNotifier.apply(context, decision)
	}

	private fun resync(context: Context, instance: String, resync: RelayResync) {
		if (!RelayPairing.acceptResync(context, instance, ts = resync.ts, fcmToken = resync.fcmToken)) return
		if (relaying(context) && resync.fcmToken !in RelayPairing.registered(context)) {
			RelayJobService.schedule(context)
		}
	}

	private fun relaying(context: Context): Boolean =
		PushSettings.mode(context) == PushMode.Fast &&
			PushSettings.fastSource(context) == FastSource.Relay &&
			PushSettings.notificationsEnabled(context)
}
