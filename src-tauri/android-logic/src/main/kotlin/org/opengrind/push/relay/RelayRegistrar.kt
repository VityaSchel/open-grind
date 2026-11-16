package org.opengrind.push.relay

import org.opengrind.push.RelayBreak
import org.opengrind.push.RelayOutcome

enum class RelayAnswer {
	Accepted,
	Retryable,
	AccountChanged,
}

interface RelayTokenRegistry {
	fun register(token: String, profileId: String): RelayAnswer

	fun unregister(token: String, profileId: String): RelayAnswer
}

class RelayRegistrar(private val ledger: RelayLedger, private val registry: RelayTokenRegistry) {
	fun register(): RelayOutcome {
		deleteOrphans()
		val instance = ledger.instance() ?: return RelayOutcome.Unpaired
		if (!ledger.paired() || ledger.broken() != null) return RelayOutcome.Unpaired
		val token = ledger.fcmToken() ?: return RelayOutcome.Unpaired
		val profileId = ledger.profileId() ?: return RelayOutcome.Unpaired
		ledger.registrationStarting(token)
		return when (registry.register(token, profileId)) {
			RelayAnswer.Accepted -> {
				ledger.recordRegistered(token)
				val retired = deleteEach(instance = instance, profileId = profileId, tokens = ledger.pendingDelete())
				if (retired == RelayOutcome.AccountChanged) retired else RelayOutcome.Done
			}
			RelayAnswer.AccountChanged -> accountChanged(instance)
			RelayAnswer.Retryable -> RelayOutcome.Failed
		}
	}

	fun unregisterAll(): RelayOutcome {
		val orphanDeletion = deleteOrphans()
		val instance = ledger.instance() ?: return orphanDeletion
		val profileId = ledger.profileId() ?: return orphanDeletion
		val pairedDeletion = deleteEach(instance = instance, profileId = profileId, tokens = ledger.everyToken())
		return if (pairedDeletion == RelayOutcome.Done) orphanDeletion else pairedDeletion
	}

	fun deleteOrphans(): RelayOutcome {
		val orphans = ledger.orphans() ?: return RelayOutcome.Done
		var undeleted = false
		for (token in orphans.tokens) {
			when (registry.unregister(token, orphans.profileId)) {
				RelayAnswer.Accepted -> ledger.orphanDeleted(token)
				RelayAnswer.AccountChanged -> {
					ledger.dropOrphans(ofProfile = orphans.profileId)
					return RelayOutcome.Done
				}
				RelayAnswer.Retryable -> undeleted = true
			}
		}
		return if (undeleted) RelayOutcome.Failed else RelayOutcome.Done
	}

	private fun deleteEach(instance: String, profileId: String, tokens: Set<String>): RelayOutcome {
		var undeleted = false
		for (token in tokens) {
			when (registry.unregister(token, profileId)) {
				RelayAnswer.Accepted -> ledger.recordDeleted(token)
				RelayAnswer.AccountChanged -> return accountChanged(instance)
				RelayAnswer.Retryable -> undeleted = true
			}
		}
		return if (undeleted) RelayOutcome.Failed else RelayOutcome.Done
	}

	private fun accountChanged(instance: String): RelayOutcome {
		ledger.markBroken(RelayBreak.AccountChanged, instance)
		return RelayOutcome.AccountChanged
	}
}
