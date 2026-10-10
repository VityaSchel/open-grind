package org.opengrind.update

import org.junit.Assert.assertEquals
import org.junit.Test

class TransferProgressTest {
	@Test
	fun `a reported percent shows as that percent`() {
		assertEquals(TransferProgress.Percent(42), TransferProgress.of(42))
	}

	@Test
	fun `a report without a percent shows as indeterminate`() {
		assertEquals(TransferProgress.Indeterminate, TransferProgress.of(null))
	}
}
