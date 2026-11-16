package org.opengrind.push.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.opengrind.push.RelayBreak
import org.opengrind.push.RelayOutcome
import org.opengrind.push.relay.PairingBench.Companion.NOW
import org.opengrind.push.relay.PairingBench.Companion.OTHER_PROFILE
import org.opengrind.push.relay.PairingBench.Companion.PROFILE

class RelayRegistrarTest {
	private val bench = PairingBench()
	private val ledger = bench.ledger
	private val registrar = bench.registrar
	private val grindr = bench.grindr

	@Test
	fun `forgetting the pairing keeps the tokens Grindr did not delete`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.recordRegistered("id:t0")
		bench.pair("relay-b", token = "id:t1")
		ledger.recordRegistered("id:t1")
		grindr.unregisterAnswer = { RelayAnswer.Retryable }
		assertEquals(RelayOutcome.Failed, registrar.unregisterAll())
		assertTrue(ledger.forget())
		assertFalse(ledger.paired())
		assertEquals(emptySet<String>(), ledger.everyToken())
		val orphans = ledger.orphans()
		assertEquals(PROFILE, orphans?.profileId)
		assertEquals(setOf("id:t0", "id:t1"), orphans?.tokens)
	}

	@Test
	fun `forgetting the pairing after every delete succeeded leaves no orphans`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.recordRegistered("id:t0")
		assertEquals(RelayOutcome.Done, registrar.unregisterAll())
		assertFalse(ledger.forget())
		assertNull(ledger.orphans())
		assertTrue(bench.store.values.isEmpty())
	}

	@Test
	fun `a current token Grindr deleted is neither deleted again nor orphaned`() {
		bench.pair("relay-a", token = "id:t0")
		assertEquals(RelayOutcome.Done, registrar.unregisterAll())
		assertEquals(RelayOutcome.Done, registrar.unregisterAll())
		assertEquals(listOf("unregister id:t0 $PROFILE"), grindr.calls)
		assertEquals("id:t0", ledger.fcmToken())
		assertFalse(ledger.forget())
	}

	@Test
	fun `a registration attempt makes a deleted token count as undeleted again`() {
		bench.pair("relay-a", token = "id:t0")
		registrar.unregisterAll()
		grindr.registerAnswer = { RelayAnswer.Retryable }
		assertEquals(RelayOutcome.Failed, registrar.register())
		assertTrue(ledger.forget())
		assertEquals(setOf("id:t0"), ledger.orphans()?.tokens)
	}

	@Test
	fun `a resync with a new token is undeleted even after the old token was deleted`() {
		bench.pair("relay-a", token = "id:t0")
		registrar.unregisterAll()
		ledger.acceptResync("relay-a", ts = NOW + 10, fcmToken = "id:t1")
		assertEquals(setOf("id:t1"), ledger.everyToken())
	}

	@Test
	fun `forgetting without any relay state writes nothing`() {
		assertFalse(ledger.forget())
		assertEquals(0, bench.store.writes)
		assertEquals(RelayOutcome.Done, registrar.unregisterAll())
		assertEquals(emptyList<String>(), grindr.calls)
		assertEquals(0, bench.store.writes)
	}

	@Test
	fun `deleting orphans drops each deleted token and keeps the retryable ones`() {
		bench.pair("relay-a", token = "id:t0")
		bench.pair("relay-b", token = "id:t1")
		ledger.forget()
		grindr.unregisterAnswer = { token -> if (token == "id:t0") RelayAnswer.Accepted else RelayAnswer.Retryable }
		assertEquals(RelayOutcome.Failed, registrar.deleteOrphans())
		assertEquals(setOf("id:t1"), ledger.orphans()?.tokens)
		grindr.unregisterAnswer = { RelayAnswer.Accepted }
		assertEquals(RelayOutcome.Done, registrar.deleteOrphans())
		assertNull(ledger.orphans())
		assertTrue(bench.store.values.isEmpty())
	}

	@Test
	fun `orphans are deleted under the profile that registered them`() {
		bench.pair("relay-a", token = "id:t0", profileId = OTHER_PROFILE)
		ledger.forget()
		registrar.deleteOrphans()
		assertEquals(listOf("unregister id:t0 $OTHER_PROFILE"), grindr.calls)
	}

	@Test
	fun `an orphan answer for another account drops the whole set and breaks no pairing`() {
		bench.pair("relay-a", token = "id:t0")
		bench.pair("relay-b", token = "id:t1")
		ledger.forget()
		bench.pair("relay-a", token = "id:t2")
		grindr.unregisterAnswer = { RelayAnswer.AccountChanged }
		assertEquals(RelayOutcome.Done, registrar.deleteOrphans())
		assertNull(ledger.orphans())
		assertNull(ledger.broken())
		assertEquals(1, grindr.calls.size)
	}

	@Test
	fun `unregistering also deletes orphans and reports the ones left`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.forget()
		grindr.unregisterAnswer = { RelayAnswer.Retryable }
		assertEquals(RelayOutcome.Failed, registrar.unregisterAll())
		assertEquals(setOf("id:t0"), ledger.orphans()?.tokens)
		grindr.unregisterAnswer = { RelayAnswer.Accepted }
		assertEquals(RelayOutcome.Done, registrar.unregisterAll())
		assertNull(ledger.orphans())
	}

	@Test
	fun `an orphan left by a failed delete fails unregistering even when the pairing tokens went`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.forget()
		bench.pair("relay-b", token = "id:t1")
		grindr.unregisterAnswer = { token -> if (token == "id:t0") RelayAnswer.Retryable else RelayAnswer.Accepted }
		assertEquals(RelayOutcome.Failed, registrar.unregisterAll())
		assertEquals(emptySet<String>(), ledger.everyToken())
	}

	@Test
	fun `registering deletes orphans first and keeps a token it registers again`() {
		bench.pair("relay-a", token = "id:t1")
		ledger.forget()
		bench.pair("relay-b", token = "id:t1")
		grindr.unregisterAnswer = { RelayAnswer.Retryable }
		assertEquals(RelayOutcome.Done, registrar.register())
		assertEquals(listOf("unregister id:t1 $PROFILE", "register id:t1 $PROFILE"), grindr.calls)
		assertNull(ledger.orphans())
		assertEquals(setOf("id:t1"), ledger.registered())
	}

	@Test
	fun `a retired token Grindr could not delete does not fail registration`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.recordRegistered("id:t0")
		bench.pair("relay-b", token = "id:t1")
		grindr.unregisterAnswer = { RelayAnswer.Retryable }
		assertEquals(RelayOutcome.Done, registrar.register())
		assertEquals(setOf("id:t0"), ledger.pendingDelete())
		assertEquals(setOf("id:t1"), ledger.registered())
	}

	@Test
	fun `an account change while deleting breaks the pairing it was deleting for`() {
		bench.pair("relay-a", token = "id:t0")
		grindr.unregisterAnswer = { RelayAnswer.AccountChanged }
		assertEquals(RelayOutcome.AccountChanged, registrar.unregisterAll())
		assertEquals(RelayBreak.AccountChanged, ledger.broken())
	}

	@Test
	fun `an account change while registering breaks the pairing`() {
		bench.pair("relay-a", token = "id:t0")
		grindr.registerAnswer = { RelayAnswer.AccountChanged }
		assertEquals(RelayOutcome.AccountChanged, registrar.register())
		assertEquals(RelayBreak.AccountChanged, ledger.broken())
	}

	@Test
	fun `an account change while deleting retired tokens after registering is reported`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.recordRegistered("id:t0")
		bench.pair("relay-b", token = "id:t1")
		grindr.unregisterAnswer = { RelayAnswer.AccountChanged }
		assertEquals(RelayOutcome.AccountChanged, registrar.register())
		assertEquals(RelayBreak.AccountChanged, ledger.broken())
		assertEquals(setOf("id:t1"), ledger.registered())
	}

	@Test
	fun `registering after the retired tokens went leaves only the current one`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.recordRegistered("id:t0")
		bench.pair("relay-b", token = "id:t1")
		assertEquals(RelayOutcome.Done, registrar.register())
		assertEquals(listOf("register id:t1 $PROFILE", "unregister id:t0 $PROFILE"), grindr.calls)
		assertEquals(setOf("id:t1"), ledger.everyToken())
	}

	@Test
	fun `nothing is registered without a working pairing`() {
		assertEquals(RelayOutcome.Unpaired, registrar.register())
		bench.pair("relay-a", key = "04ff")
		assertEquals(RelayOutcome.Unpaired, registrar.register())
		bench.pair("relay-a")
		ledger.markBroken(RelayBreak.EndpointChanged, "relay-a")
		assertEquals(RelayOutcome.Unpaired, registrar.register())
		assertEquals(emptyList<String>(), grindr.calls)
	}
}
