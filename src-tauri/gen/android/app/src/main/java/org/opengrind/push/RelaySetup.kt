package org.opengrind.push

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import app.tauri.plugin.Invoke
import org.opengrind.push.relay.EndpointDigest
import org.opengrind.push.relay.RelayConfig
import org.opengrind.push.relay.RelayKey
import org.opengrind.push.relay.RelayResync
import org.opengrind.push.relay.SignedEnvelope
import org.opengrind.push.relay.VapidKeyPair
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.UnifiedPush
import org.unifiedpush.android.connector.data.PushEndpoint

class RelayCandidate(val relayKeyHex: String, val fcmToken: String, val ts: Long)

enum class RelayCommitResult {
	Matched,
	Mismatched,
	NoSetup,
}

object RelaySetup {
	private enum class Phase {
		Choosing,
		Registering,
		Configuring,
		Frozen,
	}

	private const val REGISTER_TIMEOUT_MS = 20_000L
	private const val CHOOSER_GRACE_MS = 500L

	private val handler = Handler(Looper.getMainLooper())

	private var generation = 0L
	private var phase: Phase? = null
	private var instance: String? = null
	private var vapid: VapidKeyPair? = null
	private var config: ByteArray? = null
	private var endpointDigest: String? = null
	private var candidate: RelayCandidate? = null
	private var pendingBegin: Invoke? = null
	private var pendingAwait: Invoke? = null
	private var timeout: Runnable? = null

	@Synchronized
	fun begin(activity: Activity, invoke: Invoke) {
		val context = activity.applicationContext
		cancel(context)
		if (UnifiedPush.getDistributors(context).isEmpty()) {
			return invoke.reject(RelayContract.ERROR_NO_DISTRIBUTOR)
		}
		val chosen = generation
		phase = Phase.Choosing
		pendingBegin = invoke
		try {
			UnifiedPush.tryUseCurrentOrDefaultDistributor(activity) { picked ->
				distributorPicked(context, chosen, picked)
			}
		} catch (e: Exception) {
			distributorPicked(context, chosen, false)
		}
	}

	@Synchronized
	fun resumed() {
		if (phase != Phase.Choosing) return
		val waiting = generation
		handler.postDelayed({ chooserAbandoned(waiting) }, CHOOSER_GRACE_MS)
	}

	@Synchronized
	fun await(invoke: Invoke) {
		when (phase) {
			Phase.Frozen -> invoke.resolve()
			Phase.Configuring -> {
				pendingAwait?.reject(RelayContract.ERROR_CANCELLED)
				pendingAwait = invoke
			}
			Phase.Choosing, Phase.Registering, null -> invoke.reject(RelayContract.ERROR_NO_SETUP)
		}
	}

	@Synchronized
	fun config(): ByteArray? = config?.takeIf { phase == Phase.Configuring || phase == Phase.Frozen }?.copyOf()

	@Synchronized
	fun commit(context: Context, code: String, profileId: String): RelayCommitResult {
		val frozen = candidate?.takeIf { phase == Phase.Frozen } ?: return RelayCommitResult.NoSetup
		val setupInstance = instance ?: return RelayCommitResult.NoSetup
		val digest = endpointDigest ?: return RelayCommitResult.NoSetup
		val relayKey = RelayKey.ofHex(frozen.relayKeyHex) ?: return RelayCommitResult.NoSetup
		if (!relayKey.matchesCode(code)) return RelayCommitResult.Mismatched
		RelayJobService.cancel(context)
		val replaced = RelayPairing.commit(
			context,
			RelayCommitment(
				instance = setupInstance,
				relayKeyHex = frozen.relayKeyHex,
				profileId = profileId,
				fcmToken = frozen.fcmToken,
				endpointDigest = digest,
				resyncTs = frozen.ts,
			),
		)
		replaced?.let { runCatching { UnifiedPush.unregister(context, it) } }
		PushSettings.setFastSource(context, FastSource.Relay)
		clear()
		RelayConfigFile.delete(context)
		return RelayCommitResult.Matched
	}

	@Synchronized
	fun cancel(context: Context) {
		generation++
		pendingBegin?.reject(RelayContract.ERROR_CANCELLED)
		pendingAwait?.reject(RelayContract.ERROR_CANCELLED)
		abandon(context, instance ?: RelayPairing.setupInstance(context))
		clear()
		RelayConfigFile.delete(context)
	}

	@Synchronized
	fun endpointArrived(context: Context, endpoint: PushEndpoint, instance: String): Boolean {
		if (!owns(instance)) return false
		val keys = endpoint.pubKeySet
		val digest = keys?.let { EndpointDigest.of(endpoint.url, it.pubKey, it.auth) }
		when (phase) {
			Phase.Registering -> {
				val signing = vapid
				if (keys == null || digest == null || signing == null) {
					failRegistration(context, RelayContract.ERROR_REGISTRATION_FAILED)
				} else {
					config = RelayConfig.json(endpoint.url, keys.pubKey, keys.auth, signing.privateKey)
					endpointDigest = digest
					phase = Phase.Configuring
					stopTimeout()
					pendingBegin?.resolve()
					pendingBegin = null
				}
			}
			Phase.Configuring, Phase.Frozen -> if (digest != endpointDigest) lose(context)
			Phase.Choosing, null -> Unit
		}
		return true
	}

	@Synchronized
	fun messageArrived(content: ByteArray, instance: String): Boolean {
		if (!owns(instance)) return false
		if (phase != Phase.Configuring) return true
		val envelope = SignedEnvelope.split(content) ?: return true
		val resync = envelope.message() as? RelayResync ?: return true
		if (!envelope.verifiedBy(resync.relayKey)) return true
		candidate = RelayCandidate(resync.relayKey.hex, resync.fcmToken, resync.ts)
		phase = Phase.Frozen
		pendingAwait?.resolve()
		pendingAwait = null
		return true
	}

	@Synchronized
	fun registrationFailed(context: Context, reason: FailedReason, instance: String): Boolean {
		if (!owns(instance)) return false
		if (phase == Phase.Registering) failRegistration(context, markerOf(reason)) else lose(context)
		return true
	}

	@Synchronized
	fun unregistered(context: Context, instance: String): Boolean {
		if (!owns(instance)) return false
		if (phase == Phase.Registering) {
			failRegistration(context, RelayContract.ERROR_DISTRIBUTOR_UNAVAILABLE)
		} else {
			lose(context)
		}
		return true
	}

	@Synchronized
	private fun distributorPicked(context: Context, chosen: Long, picked: Boolean) {
		if (chosen != generation || phase != Phase.Choosing) return
		if (!picked) {
			pendingBegin?.reject(RelayContract.ERROR_DISTRIBUTOR_UNAVAILABLE)
			clear()
			return
		}
		val setupInstance = RelayPairing.nextSetupInstance(context)
		RelayPairing.setSetupInstance(context, setupInstance)
		instance = setupInstance
		phase = Phase.Registering
		try {
			val keys = VapidKeyPair.generate()
			vapid = keys
			UnifiedPush.register(context, setupInstance, null, keys.publicKey)
		} catch (e: Exception) {
			failRegistration(context, RelayContract.ERROR_REGISTRATION_FAILED)
			return
		}
		val expire = Runnable { timedOut(context, chosen) }
		timeout = expire
		handler.postDelayed(expire, REGISTER_TIMEOUT_MS)
	}

	@Synchronized
	private fun chooserAbandoned(waiting: Long) {
		if (waiting != generation || phase != Phase.Choosing) return
		pendingBegin?.reject(RelayContract.ERROR_CANCELLED)
		clear()
	}

	@Synchronized
	private fun timedOut(context: Context, chosen: Long) {
		if (chosen != generation || phase != Phase.Registering) return
		failRegistration(context, RelayContract.ERROR_TIMED_OUT)
	}

	private fun owns(instance: String): Boolean = phase != null && instance == this.instance

	private fun failRegistration(context: Context, marker: String) {
		pendingBegin?.reject(marker)
		abandon(context, instance)
		clear()
	}

	private fun lose(context: Context) {
		pendingAwait?.reject(RelayContract.ERROR_SETUP_LOST)
		clear()
		RelayConfigFile.delete(context)
	}

	private fun abandon(context: Context, setupInstance: String?) {
		if (setupInstance == null) return
		runCatching { UnifiedPush.unregister(context, setupInstance) }
		RelayPairing.setSetupInstance(context, null)
	}

	private fun stopTimeout() {
		timeout?.let { handler.removeCallbacks(it) }
		timeout = null
	}

	private fun clear() {
		stopTimeout()
		phase = null
		instance = null
		vapid = null
		config = null
		endpointDigest = null
		candidate = null
		pendingBegin = null
		pendingAwait = null
	}

	private fun markerOf(reason: FailedReason): String = when (reason) {
		FailedReason.ACTION_REQUIRED -> RelayContract.ERROR_ACTION_REQUIRED
		FailedReason.VAPID_REQUIRED -> RelayContract.ERROR_VAPID_REQUIRED
		FailedReason.NETWORK -> RelayContract.ERROR_NETWORK
		FailedReason.INTERNAL_ERROR -> RelayContract.ERROR_REGISTRATION_FAILED
	}
}
