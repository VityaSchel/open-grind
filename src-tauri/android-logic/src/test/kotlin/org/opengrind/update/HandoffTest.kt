package org.opengrind.update

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Before
import org.junit.Test

private class Handed

class HandoffTest {
	private val handoff = Handoff<Handed>()

	@Before
	@After
	fun forget() {
		handoff.forget()
	}

	@Test
	fun `an intent offered before anyone waits is handed to the next listener`() {
		val offered = Handed()
		handoff.offer(offered)

		var received: Handed? = null
		handoff.onNext { received = it }

		assertSame(offered, received)
	}

	@Test
	fun `a waiting listener is called the moment an intent arrives`() {
		var received: Handed? = null
		handoff.onNext { received = it }
		assertNull("nothing may fire before an intent exists", received)

		val offered = Handed()
		handoff.offer(offered)

		assertSame(offered, received)
	}

	@Test
	fun `an intent is delivered once, never to a later listener`() {
		val offered = Handed()
		handoff.offer(offered)

		var deliveries = 0
		handoff.onNext { deliveries += 1 }
		handoff.onNext { deliveries += 1 }

		assertEquals(1, deliveries)
	}

	@Test
	fun `a listener is consumed by the first intent only`() {
		var deliveries = 0
		handoff.onNext { deliveries += 1 }

		handoff.offer(Handed())
		handoff.offer(Handed())

		assertEquals(1, deliveries)
	}

	@Test
	fun `forgetting drops a stashed intent so a stale prompt cannot reappear`() {
		handoff.offer(Handed())
		handoff.forget()

		var received: Handed? = null
		handoff.onNext { received = it }

		assertNull(received)
	}

	@Test
	fun `forgetting drops a waiting listener so it cannot fire late`() {
		var deliveries = 0
		handoff.onNext { deliveries += 1 }
		handoff.forget()

		handoff.offer(Handed())

		assertEquals(0, deliveries)
	}

	@Test
	fun `the newest intent replaces one nobody collected`() {
		handoff.offer(Handed())
		val newest = Handed()
		handoff.offer(newest)

		var received: Handed? = null
		handoff.onNext { received = it }

		assertSame(newest, received)
	}
}
