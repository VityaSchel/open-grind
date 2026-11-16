package org.opengrind.push.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.opengrind.push.RelayBreak
import org.opengrind.push.relay.PairingBench.Companion.DAY
import org.opengrind.push.relay.PairingBench.Companion.NOW
import org.opengrind.push.relay.PairingBench.Companion.OTHER_PROFILE
import org.opengrind.push.relay.PairingBench.Companion.PROFILE
import org.opengrind.push.relay.RelayFixtures.REFERENCE_PUBLIC
import org.opengrind.push.relay.RelayFixtures.SMALL_PUBLIC

class RelayLedgerTest {
	private val bench = PairingBench()
	private val ledger = bench.ledger

	@Test
	fun `a break meant for a superseded instance leaves the new pairing working`() {
		bench.pair("relay-a", key = REFERENCE_PUBLIC)
		bench.pair("relay-b", key = SMALL_PUBLIC)
		ledger.markBroken(RelayBreak.RelayKeyChanged, "relay-a", relayKeyHex = REFERENCE_PUBLIC)
		ledger.markBroken(RelayBreak.EndpointChanged, "relay-a")
		ledger.markBroken(RelayBreak.Unregistered, "relay-a")
		assertNull(ledger.broken())
	}

	@Test
	fun `a relay key change breaks the pairing only while the checked key is still pinned`() {
		bench.pair("relay-a", key = SMALL_PUBLIC)
		ledger.markBroken(RelayBreak.RelayKeyChanged, "relay-a", relayKeyHex = REFERENCE_PUBLIC)
		assertNull(ledger.broken())
		ledger.markBroken(RelayBreak.RelayKeyChanged, "relay-a", relayKeyHex = RelayKey.ofHex(SMALL_PUBLIC)!!.hex)
		assertEquals(RelayBreak.RelayKeyChanged, ledger.broken())
	}

	@Test
	fun `the first recorded break wins`() {
		bench.pair("relay-a")
		ledger.markBroken(RelayBreak.EndpointChanged, "relay-a")
		ledger.markBroken(RelayBreak.Unregistered, "relay-a")
		assertEquals(RelayBreak.EndpointChanged, ledger.broken())
	}

	@Test
	fun `a break needs a committed pairing`() {
		ledger.markBroken(RelayBreak.EndpointChanged, "relay-a")
		assertNull(ledger.broken())
		assertEquals(0, bench.store.writes)
	}

	@Test
	fun `an unknown stored break reads as unregistered`() {
		bench.store.values["broken"] = "gone-fishing"
		assertEquals(RelayBreak.Unregistered, ledger.broken())
	}

	@Test
	fun `a future-dated first resync blocks later token rotations only for the skew window`() {
		bench.pair("relay-a", token = "id:old", ts = NOW + 30 * DAY)
		assertFalse(ledger.acceptResync("relay-a", ts = NOW + 10, fcmToken = "id:soon"))
		assertTrue(ledger.acceptResync("relay-a", ts = NOW + RESYNC_SKEW_SECONDS + 5, fcmToken = "id:new"))
		assertEquals("id:new", ledger.fcmToken())
	}

	@Test
	fun `a future-dated accepted resync blocks later ones only for the skew window`() {
		bench.pair("relay-a", token = "id:a")
		assertTrue(ledger.acceptResync("relay-a", ts = NOW + 30 * DAY, fcmToken = "id:b"))
		assertTrue(ledger.acceptResync("relay-a", ts = NOW + RESYNC_SKEW_SECONDS + 5, fcmToken = "id:c"))
		assertEquals("id:c", ledger.fcmToken())
	}

	@Test
	fun `an older or repeated resync is still refused`() {
		bench.pair("relay-a", token = "id:a", ts = NOW)
		assertFalse(ledger.acceptResync("relay-a", ts = NOW - 5, fcmToken = "id:b"))
		assertFalse(ledger.acceptResync("relay-a", ts = NOW, fcmToken = "id:b"))
		assertEquals("id:a", ledger.fcmToken())
	}

	@Test
	fun `a resync for an instance that is no longer committed changes nothing`() {
		bench.pair("relay-a", token = "id:a")
		bench.pair("relay-b", token = "id:b")
		assertFalse(ledger.acceptResync("relay-a", ts = NOW + 10, fcmToken = "id:a2"))
		assertEquals("id:b", ledger.fcmToken())
	}

	@Test
	fun `a resync that rotates a registered token retires it for deletion`() {
		bench.pair("relay-a", token = "id:a")
		ledger.recordRegistered("id:a")
		assertTrue(ledger.acceptResync("relay-a", ts = NOW + 10, fcmToken = "id:b"))
		assertEquals(emptySet<String>(), ledger.registered())
		assertEquals(setOf("id:a"), ledger.pendingDelete())
		assertEquals(setOf("id:a", "id:b"), ledger.everyToken())
	}

	@Test
	fun `a resync with the same token only advances the timestamp`() {
		bench.pair("relay-a", token = "id:a")
		ledger.recordRegistered("id:a")
		assertTrue(ledger.acceptResync("relay-a", ts = NOW + 10, fcmToken = "id:a"))
		assertEquals(setOf("id:a"), ledger.registered())
		assertEquals(emptySet<String>(), ledger.pendingDelete())
		assertFalse(ledger.acceptResync("relay-a", ts = NOW + 10, fcmToken = "id:a"))
	}

	@Test
	fun `a commit names the instance it supersedes`() {
		assertNull(bench.pair("relay-a"))
		assertNull(bench.pair("relay-a"))
		assertEquals("relay-a", bench.pair("relay-b"))
	}

	@Test
	fun `a commit retires every other undeleted token and starts the new pairing clean`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.recordRegistered("id:t0")
		ledger.acceptResync("relay-a", ts = NOW + 10, fcmToken = "id:t1")
		ledger.recordRegistered("id:t1")
		ledger.seenBefore("ab")
		ledger.markBroken(RelayBreak.EndpointChanged, "relay-a")
		ledger.setSetupInstance("relay-b")
		bench.pair("relay-b", token = "id:t2")
		assertEquals(setOf("id:t0", "id:t1"), ledger.pendingDelete())
		assertEquals(emptySet<String>(), ledger.registered())
		assertNull(ledger.broken())
		assertNull(ledger.setupInstance())
		assertFalse(ledger.seenBefore("ab"))
		assertEquals("id:t2", ledger.fcmToken())
	}

	@Test
	fun `a commit keeps a token it pairs again out of the deletions`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.recordRegistered("id:t0")
		bench.pair("relay-b", token = "id:t0")
		assertEquals(emptySet<String>(), ledger.pendingDelete())
	}

	@Test
	fun `a commit stores the pairing under the names existing installs read`() {
		bench.pair("relay-a", key = REFERENCE_PUBLIC, token = "id:t0", ts = NOW + 30 * DAY)
		assertEquals(
			mapOf(
				"instance" to "relay-a",
				"relay_key" to REFERENCE_PUBLIC,
				"profile_id" to PROFILE,
				"fcm_token" to "id:t0",
				"pending_delete" to emptySet<String>(),
				"endpoint_digest" to "digest-relay-a",
				"last_resync_ts" to NOW + RESYNC_SKEW_SECONDS,
			),
			bench.store.values,
		)
	}

	@Test
	fun `a pairing needs both an instance and a valid relay key`() {
		assertFalse(ledger.paired())
		bench.pair("relay-a", key = "04ff")
		assertFalse(ledger.paired())
		bench.pair("relay-a", key = SMALL_PUBLIC)
		assertTrue(ledger.paired())
		assertEquals(RelayKey.ofHex(SMALL_PUBLIC), ledger.relayKey())
		assertEquals("digest-relay-a", ledger.endpointDigest())
		assertEquals(PROFILE, ledger.profileId())
		assertEquals("relay-a", ledger.instance())
	}

	@Test
	fun `setup alternates between the two instances`() {
		assertEquals("relay-a", ledger.nextSetupInstance())
		bench.pair("relay-a")
		assertEquals("relay-b", ledger.nextSetupInstance())
		bench.pair("relay-b")
		assertEquals("relay-a", ledger.nextSetupInstance())
	}

	@Test
	fun `clearing a setup instance that was never set writes nothing`() {
		ledger.setSetupInstance(null)
		assertEquals(0, bench.store.writes)
		ledger.setSetupInstance("relay-b")
		assertEquals("relay-b", ledger.setupInstance())
		ledger.setSetupInstance(null)
		assertNull(ledger.setupInstance())
	}

	@Test
	fun `a signature is new once and repeated after that`() {
		bench.pair("relay-a")
		assertFalse(ledger.seenBefore("aa"))
		assertFalse(ledger.seenBefore("bb"))
		val writes = bench.store.writes
		assertTrue(ledger.seenBefore("aa"))
		assertEquals(writes, bench.store.writes)
		assertEquals("aa,bb", bench.store.values["seen"])
	}

	@Test
	fun `a registered token lands in registered when current and in pending delete otherwise`() {
		bench.pair("relay-a", token = "id:t1")
		ledger.recordRegistered("id:t1")
		ledger.recordRegistered("id:t0")
		assertEquals(setOf("id:t1"), ledger.registered())
		assertEquals(setOf("id:t0"), ledger.pendingDelete())
	}

	@Test
	fun `a registration without a pairing is not recorded`() {
		ledger.recordRegistered("id:t1")
		ledger.recordDeleted("id:t1")
		assertEquals(0, bench.store.writes)
	}

	@Test
	fun `deleting the current token marks it deleted until a registration starts`() {
		bench.pair("relay-a", token = "id:t1")
		ledger.recordRegistered("id:t1")
		ledger.recordDeleted("id:t1")
		assertEquals(emptySet<String>(), ledger.everyToken())
		ledger.registrationStarting("id:other")
		assertEquals(emptySet<String>(), ledger.everyToken())
		ledger.registrationStarting("id:t1")
		assertEquals(setOf("id:t1"), ledger.everyToken())
	}

	@Test
	fun `deleting a retired token drops it from the deletions`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.recordRegistered("id:t0")
		bench.pair("relay-b", token = "id:t1")
		ledger.recordDeleted("id:t0")
		assertEquals(emptySet<String>(), ledger.pendingDelete())
		assertEquals(setOf("id:t1"), ledger.everyToken())
	}

	@Test
	fun `orphans from the same profile accumulate across forgets`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.forget()
		bench.pair("relay-b", token = "id:t1")
		assertTrue(ledger.forget())
		assertEquals(setOf("id:t0", "id:t1"), ledger.orphans()?.tokens)
		assertTrue(ledger.forget())
		assertEquals(setOf("id:t0", "id:t1"), ledger.orphans()?.tokens)
	}

	@Test
	fun `orphans from another profile are replaced`() {
		bench.pair("relay-a", token = "id:t0", profileId = OTHER_PROFILE)
		ledger.forget()
		bench.pair("relay-b", token = "id:t1", profileId = PROFILE)
		ledger.forget()
		val orphans = ledger.orphans()
		assertEquals(PROFILE, orphans?.profileId)
		assertEquals(setOf("id:t1"), orphans?.tokens)
	}

	@Test
	fun `a token registered again is no longer an orphan`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.forget()
		bench.pair("relay-b", token = "id:t0")
		ledger.recordRegistered("id:t0")
		assertNull(ledger.orphans())
		assertEquals(setOf("id:t0"), ledger.registered())
		assertFalse("orphaned_profile" in bench.store)
	}

	@Test
	fun `a deleted orphan leaves the others and the last one takes the profile with it`() {
		bench.pair("relay-a", token = "id:t0")
		bench.pair("relay-b", token = "id:t1")
		ledger.forget()
		ledger.orphanDeleted("id:t0")
		assertEquals(setOf("id:t1"), ledger.orphans()?.tokens)
		val writes = bench.store.writes
		ledger.orphanDeleted("id:unknown")
		assertEquals(writes, bench.store.writes)
		ledger.orphanDeleted("id:t1")
		assertNull(ledger.orphans())
		assertTrue(bench.store.values.isEmpty())
	}

	@Test
	fun `dropping orphans clears them and keeps the pairing`() {
		bench.pair("relay-a", token = "id:t0")
		ledger.forget()
		bench.pair("relay-b", token = "id:t1")
		ledger.dropOrphans(ofProfile = OTHER_PROFILE)
		assertEquals(setOf("id:t0"), ledger.orphans()?.tokens)
		ledger.dropOrphans()
		assertNull(ledger.orphans())
		assertTrue(ledger.paired())
		val writes = bench.store.writes
		ledger.dropOrphans()
		assertEquals(writes, bench.store.writes)
	}
}
