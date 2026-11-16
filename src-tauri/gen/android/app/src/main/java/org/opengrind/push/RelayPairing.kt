package org.opengrind.push

import android.content.Context
import java.util.concurrent.TimeUnit
import org.opengrind.push.relay.RelayKey
import org.opengrind.push.relay.RelayLedger

object RelayPairing {
	private const val PREFERENCES = "org.opengrind.push.relay"

	fun instance(context: Context): String? = ledger(context).instance()

	fun relayKey(context: Context): RelayKey? = ledger(context).relayKey()

	fun paired(context: Context): Boolean = ledger(context).paired()

	fun broken(context: Context): RelayBreak? = ledger(context).broken()

	fun profileId(context: Context): String? = ledger(context).profileId()

	fun fcmToken(context: Context): String? = ledger(context).fcmToken()

	fun endpointDigest(context: Context): String? = ledger(context).endpointDigest()

	fun registered(context: Context): Set<String> = ledger(context).registered()

	fun pendingDelete(context: Context): Set<String> = ledger(context).pendingDelete()

	fun everyToken(context: Context): Set<String> = ledger(context).everyToken()

	fun setupInstance(context: Context): String? = ledger(context).setupInstance()

	fun nextSetupInstance(context: Context): String = ledger(context).nextSetupInstance()

	fun setSetupInstance(context: Context, instance: String?) = ledger(context).setSetupInstance(instance)

	fun commit(context: Context, commitment: RelayCommitment): String? = ledger(context).commit(commitment)

	fun markBroken(context: Context, reason: RelayBreak, instance: String, relayKeyHex: String? = null) =
		ledger(context).markBroken(reason, instance, relayKeyHex)

	fun seenBefore(context: Context, signatureHex: String): Boolean = ledger(context).seenBefore(signatureHex)

	fun acceptResync(context: Context, instance: String, ts: Long, fcmToken: String): Boolean =
		ledger(context).acceptResync(instance, ts, fcmToken)

	fun registrationStarting(context: Context, token: String) = ledger(context).registrationStarting(token)

	fun recordRegistered(context: Context, token: String) = ledger(context).recordRegistered(token)

	fun recordDeleted(context: Context, token: String) = ledger(context).recordDeleted(token)

	fun forget(context: Context): Boolean = ledger(context).forget()

	fun orphans(context: Context): OrphanedTokens? = ledger(context).orphans()

	fun orphanDeleted(context: Context, token: String) = ledger(context).orphanDeleted(token)

	fun dropOrphans(context: Context, ofProfile: String? = null) = ledger(context).dropOrphans(ofProfile)

	internal fun ledger(context: Context) = RelayLedger(
		store = SharedPreferenceStore(
			context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE),
		),
		nowSeconds = ::nowSeconds,
		lock = this,
	)

	private fun nowSeconds(): Long = TimeUnit.MILLISECONDS.toSeconds(System.currentTimeMillis())
}
