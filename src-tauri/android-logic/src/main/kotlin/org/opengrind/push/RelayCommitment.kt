package org.opengrind.push

class RelayCommitment(
	val instance: String,
	val relayKeyHex: String,
	val profileId: String,
	val fcmToken: String,
	val endpointDigest: String,
	val resyncTs: Long,
)

class OrphanedTokens(val profileId: String, val tokens: Set<String>)
