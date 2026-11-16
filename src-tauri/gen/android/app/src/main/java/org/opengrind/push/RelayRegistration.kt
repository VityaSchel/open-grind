package org.opengrind.push

import android.content.Context
import java.util.concurrent.Executors
import org.opengrind.push.relay.RelayAnswer
import org.opengrind.push.relay.RelayRegistrar
import org.opengrind.push.relay.RelayTokenRegistry

object RelayRegistration {
	private const val ACCEPTED = 0
	private const val RETRYABLE = 1
	private const val ACCOUNT_CHANGED = 2

	private val worker = Executors.newSingleThreadExecutor { task -> Thread(task, "opengrind-relay") }

	private val grindr = object : RelayTokenRegistry {
		override fun register(token: String, profileId: String) = answer { RelayGrindr.nativeRegister(token, profileId) }

		override fun unregister(token: String, profileId: String) =
			answer { RelayGrindr.nativeUnregister(token, profileId) }
	}

	fun later(task: () -> Unit) = worker.execute { task() }

	fun register(context: Context): RelayOutcome = registrar(context).register()

	fun unregisterAll(context: Context): RelayOutcome = registrar(context).unregisterAll()

	fun deleteOrphans(context: Context): RelayOutcome = registrar(context).deleteOrphans()

	private fun registrar(context: Context) = RelayRegistrar(RelayPairing.ledger(context), grindr)

	private fun answer(call: () -> Int): RelayAnswer =
		when (runCatching(call).getOrDefault(RETRYABLE)) {
			ACCEPTED -> RelayAnswer.Accepted
			ACCOUNT_CHANGED -> RelayAnswer.AccountChanged
			else -> RelayAnswer.Retryable
		}
}
