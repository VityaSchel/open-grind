package org.opengrind.push.relay

import org.opengrind.push.MemoryPreferences
import org.opengrind.push.RelayCommitment

internal class PairingBench {
	val store = MemoryPreferences()
	var now = NOW
	val ledger = RelayLedger(store, nowSeconds = { now })
	val grindr = FakeGrindr()
	val registrar = RelayRegistrar(ledger, grindr)

	fun pair(
		instance: String,
		key: String = RelayFixtures.REFERENCE_PUBLIC,
		token: String = "id:t1",
		profileId: String = PROFILE,
		ts: Long = now,
	): String? = ledger.commit(
		RelayCommitment(
			instance = instance,
			relayKeyHex = key,
			profileId = profileId,
			fcmToken = token,
			endpointDigest = "digest-$instance",
			resyncTs = ts,
		),
	)

	companion object {
		const val NOW = 1_793_000_000L
		const val DAY = 86_400L
		const val PROFILE = "1001"
		const val OTHER_PROFILE = "2002"
	}
}

internal class FakeGrindr : RelayTokenRegistry {
	var registerAnswer: (String) -> RelayAnswer = { RelayAnswer.Accepted }
	var unregisterAnswer: (String) -> RelayAnswer = { RelayAnswer.Accepted }
	val calls = mutableListOf<String>()

	override fun register(token: String, profileId: String): RelayAnswer {
		calls += "register $token $profileId"
		return registerAnswer(token)
	}

	override fun unregister(token: String, profileId: String): RelayAnswer {
		calls += "unregister $token $profileId"
		return unregisterAnswer(token)
	}
}
