package org.opengrind.update

import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TransferHoldsTest {
	@Test
	fun `the last transfer to end stops the service`() {
		val holds = TransferHolds()
		holds.begin(TransferTitle.MediaUpload)

		assertNull(holds.end(TransferTitle.MediaUpload))
	}

	@Test
	fun `an overlapping transfer keeps the service showing what still runs`() {
		val holds = TransferHolds()
		holds.begin(TransferTitle.AppUpdate)
		holds.begin(TransferTitle.MediaUpload)

		assertEquals(TransferTitle.AppUpdate, holds.end(TransferTitle.MediaUpload))
		assertNull(holds.end(TransferTitle.AppUpdate))
	}

	@Test
	fun `the transfer that started last names the service`() {
		val holds = TransferHolds()
		holds.begin(TransferTitle.MediaUpload)
		holds.begin(TransferTitle.AppUpdate)
		holds.begin(TransferTitle.RecaptchaUpdate)

		assertEquals(TransferTitle.RecaptchaUpdate, holds.end(TransferTitle.AppUpdate))
		assertEquals(TransferTitle.MediaUpload, holds.end(TransferTitle.RecaptchaUpdate))
	}

	@Test
	fun `two uploads at once end one at a time`() {
		val holds = TransferHolds()
		holds.begin(TransferTitle.MediaUpload)
		holds.begin(TransferTitle.MediaUpload)

		assertEquals(TransferTitle.MediaUpload, holds.end(TransferTitle.MediaUpload))
		assertNull(holds.end(TransferTitle.MediaUpload))
	}

	@Test
	fun `an unmatched end stops nothing that still runs`() {
		val holds = TransferHolds()

		assertNull(holds.end(TransferTitle.AppUpdate))
		holds.begin(TransferTitle.MediaUpload)
		assertEquals(TransferTitle.MediaUpload, holds.end(TransferTitle.AppUpdate))
		assertNull(holds.end(TransferTitle.MediaUpload))
	}

	@Test
	fun `concurrent transfers leave nothing held once they all end`() {
		val holds = TransferHolds()
		val stopped = AtomicInteger()
		val threads = (1..16).map {
			Thread {
				repeat(200) {
					holds.begin(TransferTitle.MediaUpload)
					if (holds.end(TransferTitle.MediaUpload) == null) stopped.incrementAndGet()
				}
			}
		}

		threads.forEach(Thread::start)
		threads.forEach(Thread::join)

		assertNull(holds.end(TransferTitle.MediaUpload))
		assertTrue(stopped.get() > 0)
	}
}
