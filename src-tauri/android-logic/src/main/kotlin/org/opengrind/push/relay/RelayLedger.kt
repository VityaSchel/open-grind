package org.opengrind.push.relay

import org.opengrind.push.OrphanedTokens
import org.opengrind.push.PreferenceEdit
import org.opengrind.push.PreferenceStore
import org.opengrind.push.RelayBreak
import org.opengrind.push.RelayCommitment

class RelayLedger(
	private val store: PreferenceStore,
	private val nowSeconds: () -> Long,
	private val lock: Any = Any(),
) {
	fun instance(): String? = synchronized(lock) { store.string(INSTANCE) }

	fun relayKey(): RelayKey? = synchronized(lock) { store.string(RELAY_KEY)?.let(RelayKey::ofHex) }

	fun paired(): Boolean = synchronized(lock) { instance() != null && relayKey() != null }

	fun broken(): RelayBreak? =
		synchronized(lock) { store.string(BROKEN)?.let { RelayBreak.of(it) ?: RelayBreak.Unregistered } }

	fun profileId(): String? = synchronized(lock) { store.string(PROFILE_ID) }

	fun fcmToken(): String? = synchronized(lock) { store.string(FCM_TOKEN) }

	fun endpointDigest(): String? = synchronized(lock) { store.string(ENDPOINT_DIGEST) }

	fun registered(): Set<String> = synchronized(lock) { store.strings(REGISTERED) }

	fun pendingDelete(): Set<String> = synchronized(lock) { store.strings(PENDING_DELETE) }

	fun everyToken(): Set<String> = synchronized(lock) {
		val deleted = store.string(DELETED_TOKEN)
		val current = store.string(FCM_TOKEN)?.takeIf { it != deleted }
		store.strings(REGISTERED) + store.strings(PENDING_DELETE) + listOfNotNull(current)
	}

	fun setupInstance(): String? = synchronized(lock) { store.string(SETUP_INSTANCE) }

	fun nextSetupInstance(): String =
		synchronized(lock) { if (instance() == FIRST_INSTANCE) SECOND_INSTANCE else FIRST_INSTANCE }

	fun setSetupInstance(instance: String?) {
		synchronized(lock) {
			if (instance == null && SETUP_INSTANCE !in store) return
			store.edit { if (instance == null) remove(SETUP_INSTANCE) else putString(SETUP_INSTANCE, instance) }
		}
	}

	fun commit(commitment: RelayCommitment): String? {
		synchronized(lock) {
			val previous = store.string(INSTANCE)
			val retired = everyToken() - commitment.fcmToken
			store.edit {
				putString(INSTANCE, commitment.instance)
				putString(RELAY_KEY, commitment.relayKeyHex)
				putString(PROFILE_ID, commitment.profileId)
				putString(FCM_TOKEN, commitment.fcmToken)
				remove(DELETED_TOKEN)
				remove(REGISTERED)
				putStrings(PENDING_DELETE, retired)
				putString(ENDPOINT_DIGEST, commitment.endpointDigest)
				putLong(LAST_RESYNC_TS, clampedResyncTs(commitment.resyncTs, nowSeconds()))
				remove(SEEN)
				remove(BROKEN)
				remove(SETUP_INSTANCE)
			}
			return previous?.takeIf { it != commitment.instance }
		}
	}

	fun markBroken(reason: RelayBreak, instance: String, relayKeyHex: String? = null) {
		synchronized(lock) {
			if (store.string(INSTANCE) != instance || BROKEN in store) return
			if (relayKeyHex != null && store.string(RELAY_KEY) != relayKeyHex) return
			store.edit { putString(BROKEN, reason.wire) }
		}
	}

	fun seenBefore(signatureHex: String): Boolean {
		synchronized(lock) {
			val ring = store.string(SEEN)?.split(SEEN_SEPARATOR)?.filter(String::isNotEmpty).orEmpty()
			val seen = SeenSignatures.remember(ring, signatureHex)
			if (!seen.repeated) store.edit { putString(SEEN, seen.ring.joinToString(SEEN_SEPARATOR)) }
			return seen.repeated
		}
	}

	fun acceptResync(instance: String, ts: Long, fcmToken: String): Boolean {
		synchronized(lock) {
			if (store.string(INSTANCE) != instance) return false
			val now = nowSeconds()
			if (ts <= clampedResyncTs(store.long(LAST_RESYNC_TS, fallback = 0L), now)) return false
			val replaced = store.string(FCM_TOKEN)?.takeIf { it != fcmToken }
			val registered = store.strings(REGISTERED)
			store.edit {
				putString(FCM_TOKEN, fcmToken)
				putLong(LAST_RESYNC_TS, clampedResyncTs(ts, now))
				if (replaced != null) remove(DELETED_TOKEN)
				if (replaced != null && replaced in registered) {
					putStrings(REGISTERED, registered - replaced)
					putStrings(PENDING_DELETE, store.strings(PENDING_DELETE) + replaced)
				}
			}
			return true
		}
	}

	fun registrationStarting(token: String) {
		synchronized(lock) {
			if (store.string(DELETED_TOKEN) != token) return
			store.edit { remove(DELETED_TOKEN) }
		}
	}

	fun recordRegistered(token: String) {
		synchronized(lock) {
			if (store.string(INSTANCE) == null) return
			val key = if (store.string(FCM_TOKEN) == token) REGISTERED else PENDING_DELETE
			store.edit {
				putStrings(key, store.strings(key) + token)
				withoutOrphan(token)
			}
		}
	}

	fun recordDeleted(token: String) {
		synchronized(lock) {
			if (store.string(INSTANCE) == null) return
			store.edit {
				putStrings(REGISTERED, store.strings(REGISTERED) - token)
				putStrings(PENDING_DELETE, store.strings(PENDING_DELETE) - token)
				if (store.string(FCM_TOKEN) == token) putString(DELETED_TOKEN, token)
			}
		}
	}

	fun forget(): Boolean {
		synchronized(lock) {
			val pairingKeys = store.keys - ORPHAN_KEYS
			if (pairingKeys.isEmpty()) return ORPHANED_TOKENS in store
			val profileId = store.string(PROFILE_ID)
			val undeleted = everyToken()
			store.edit {
				pairingKeys.forEach { key -> remove(key) }
				if (profileId != null && undeleted.isNotEmpty()) {
					val sameProfile = store.string(ORPHANED_PROFILE) == profileId
					val earlier = if (sameProfile) store.strings(ORPHANED_TOKENS) else emptySet()
					putString(ORPHANED_PROFILE, profileId)
					putStrings(ORPHANED_TOKENS, earlier + undeleted)
				}
			}
			return ORPHANED_TOKENS in store
		}
	}

	fun orphans(): OrphanedTokens? {
		synchronized(lock) {
			val profileId = store.string(ORPHANED_PROFILE) ?: return null
			val tokens = store.strings(ORPHANED_TOKENS).takeIf { it.isNotEmpty() } ?: return null
			return OrphanedTokens(profileId, tokens)
		}
	}

	fun orphanDeleted(token: String) {
		synchronized(lock) {
			if (token !in store.strings(ORPHANED_TOKENS)) return
			store.edit { withoutOrphan(token) }
		}
	}

	fun dropOrphans(ofProfile: String? = null) {
		synchronized(lock) {
			if (ORPHAN_KEYS.none { it in store }) return
			if (ofProfile != null && store.string(ORPHANED_PROFILE) != ofProfile) return
			store.edit {
				remove(ORPHANED_TOKENS)
				remove(ORPHANED_PROFILE)
			}
		}
	}

	private fun PreferenceEdit.withoutOrphan(token: String) {
		val orphans = store.strings(ORPHANED_TOKENS)
		if (token !in orphans) return
		val left = orphans - token
		if (left.isEmpty()) {
			remove(ORPHANED_TOKENS)
			remove(ORPHANED_PROFILE)
		} else {
			putStrings(ORPHANED_TOKENS, left)
		}
	}

	private companion object {
		const val INSTANCE = "instance"
		const val RELAY_KEY = "relay_key"
		const val PROFILE_ID = "profile_id"
		const val FCM_TOKEN = "fcm_token"
		const val DELETED_TOKEN = "deleted_token"
		const val REGISTERED = "registered"
		const val PENDING_DELETE = "pending_delete"
		const val ENDPOINT_DIGEST = "endpoint_digest"
		const val LAST_RESYNC_TS = "last_resync_ts"
		const val SEEN = "seen"
		const val BROKEN = "broken"
		const val SETUP_INSTANCE = "setup_instance"
		const val ORPHANED_TOKENS = "orphaned_tokens"
		const val ORPHANED_PROFILE = "orphaned_profile"
		val ORPHAN_KEYS = setOf(ORPHANED_TOKENS, ORPHANED_PROFILE)
		const val SEEN_SEPARATOR = ","
		const val FIRST_INSTANCE = "relay-a"
		const val SECOND_INSTANCE = "relay-b"
	}
}
