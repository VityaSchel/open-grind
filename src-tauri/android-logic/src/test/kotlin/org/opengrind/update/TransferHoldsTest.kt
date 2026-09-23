package org.opengrind.update

import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TransferHoldsTest {
	private val upload = Transfer(TransferTitle.MediaUpload)
	private val appUpdate = Transfer(TransferTitle.AppUpdate)
	private val recaptchaUpdate = Transfer(TransferTitle.AddonUpdate, "org.opengrind.recaptcha")
	private val fcmInstall = Transfer(TransferTitle.AddonInstall, "org.opengrind.fcm")

	@Test
	fun `nothing is held before a transfer begins`() {
		assertNull(TransferHolds().newest())
	}

	@Test
	fun `a running transfer is held`() {
		val holds = TransferHolds()
		holds.begin(upload)

		assertEquals(upload, holds.newest())
	}

	@Test
	fun `a transfer that ends before the service starts leaves nothing held`() {
		val holds = TransferHolds()
		holds.begin(upload)
		holds.end(upload)

		assertNull(holds.newest())
	}

	@Test
	fun `an overlapping transfer keeps the service showing what still runs`() {
		val holds = TransferHolds()
		holds.begin(appUpdate)
		holds.begin(upload)

		holds.end(upload)
		assertEquals(appUpdate, holds.newest())
		holds.end(appUpdate)
		assertNull(holds.newest())
	}

	@Test
	fun `the transfer that started last names the service`() {
		val holds = TransferHolds()
		holds.begin(upload)
		holds.begin(appUpdate)
		holds.begin(recaptchaUpdate)

		assertEquals(recaptchaUpdate, holds.newest())
		holds.end(appUpdate)
		assertEquals(recaptchaUpdate, holds.newest())
		holds.end(recaptchaUpdate)
		assertEquals(upload, holds.newest())
	}

	@Test
	fun `an add-on still downloading keeps its own name when another add-on ends`() {
		val holds = TransferHolds()
		holds.begin(fcmInstall)
		holds.begin(recaptchaUpdate)

		holds.end(recaptchaUpdate)
		assertEquals(fcmInstall, holds.newest())
		holds.end(fcmInstall)
		assertNull(holds.newest())
	}

	@Test
	fun `two uploads at once end one at a time`() {
		val holds = TransferHolds()
		holds.begin(upload)
		holds.begin(upload)

		holds.end(upload)
		assertEquals(upload, holds.newest())
		holds.end(upload)
		assertNull(holds.newest())
	}

	@Test
	fun `an unmatched end releases nothing that still runs`() {
		val holds = TransferHolds()

		holds.end(appUpdate)
		assertNull(holds.newest())
		holds.begin(upload)
		holds.end(appUpdate)
		assertEquals(upload, holds.newest())
		holds.end(upload)
		assertNull(holds.newest())
	}

	@Test
	fun `concurrent transfers stay held while they run and leave nothing once they all end`() {
		val holds = TransferHolds()
		val unheld = AtomicInteger()
		val threads = (1..16).map {
			Thread {
				repeat(200) {
					holds.begin(upload)
					if (holds.newest() == null) unheld.incrementAndGet()
					holds.end(upload)
				}
			}
		}

		threads.forEach(Thread::start)
		threads.forEach(Thread::join)

		assertEquals(0, unheld.get())
		assertNull(holds.newest())
	}
}
