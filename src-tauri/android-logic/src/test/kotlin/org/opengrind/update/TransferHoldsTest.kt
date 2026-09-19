package org.opengrind.update

import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TransferHoldsTest {
	private val upload = Transfer(TransferTitle.MediaUpload)
	private val appUpdate = Transfer(TransferTitle.AppUpdate)
	private val recaptchaUpdate = Transfer(TransferTitle.AddonUpdate, "org.opengrind.recaptcha")
	private val fcmInstall = Transfer(TransferTitle.AddonInstall, "org.opengrind.fcm")

	@Test
	fun `the last transfer to end stops the service`() {
		val holds = TransferHolds()
		holds.begin(upload)

		assertNull(holds.end(upload))
	}

	@Test
	fun `an overlapping transfer keeps the service showing what still runs`() {
		val holds = TransferHolds()
		holds.begin(appUpdate)
		holds.begin(upload)

		assertEquals(appUpdate, holds.end(upload))
		assertNull(holds.end(appUpdate))
	}

	@Test
	fun `the transfer that started last names the service`() {
		val holds = TransferHolds()
		holds.begin(upload)
		holds.begin(appUpdate)
		holds.begin(recaptchaUpdate)

		assertEquals(recaptchaUpdate, holds.end(appUpdate))
		assertEquals(upload, holds.end(recaptchaUpdate))
	}

	@Test
	fun `an add-on still downloading keeps its own name when another add-on ends`() {
		val holds = TransferHolds()
		holds.begin(fcmInstall)
		holds.begin(recaptchaUpdate)

		assertEquals(fcmInstall, holds.end(recaptchaUpdate))
		assertNull(holds.end(fcmInstall))
	}

	@Test
	fun `two uploads at once end one at a time`() {
		val holds = TransferHolds()
		holds.begin(upload)
		holds.begin(upload)

		assertEquals(upload, holds.end(upload))
		assertNull(holds.end(upload))
	}

	@Test
	fun `an unmatched end stops nothing that still runs`() {
		val holds = TransferHolds()

		assertNull(holds.end(appUpdate))
		holds.begin(upload)
		assertEquals(upload, holds.end(appUpdate))
		assertNull(holds.end(upload))
	}

	@Test
	fun `concurrent transfers leave nothing held once they all end`() {
		val holds = TransferHolds()
		val stopped = AtomicInteger()
		val threads = (1..16).map {
			Thread {
				repeat(200) {
					holds.begin(upload)
					if (holds.end(upload) == null) stopped.incrementAndGet()
				}
			}
		}

		threads.forEach(Thread::start)
		threads.forEach(Thread::join)

		assertNull(holds.end(upload))
		assertTrue(stopped.get() > 0)
	}
}
