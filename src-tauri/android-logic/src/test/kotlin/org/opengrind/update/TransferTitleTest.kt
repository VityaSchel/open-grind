package org.opengrind.update

import org.junit.Assert.assertEquals
import org.junit.Test

class TransferTitleTest {
	@Test
	fun `a download of this app is always an update`() {
		assertEquals(TransferTitle.AppUpdate, TransferTitle.of(updatesThisApp = true, kind = "install"))
		assertEquals(TransferTitle.AppUpdate, TransferTitle.of(updatesThisApp = true, kind = "update"))
	}

	@Test
	fun `an add-on that is not installed yet is downloaded for a first install`() {
		assertEquals(TransferTitle.AddonInstall, TransferTitle.of(updatesThisApp = false, kind = "install"))
	}

	@Test
	fun `an installed add-on is downloaded as an update`() {
		assertEquals(TransferTitle.AddonUpdate, TransferTitle.of(updatesThisApp = false, kind = "update"))
	}

	@Test
	fun `an add-on download with an unknown kind never claims to be a first install`() {
		assertEquals(TransferTitle.AddonUpdate, TransferTitle.of(updatesThisApp = false, kind = null))
	}

	@Test
	fun `a media upload keeps its own title whatever the download fields say`() {
		assertEquals(
			TransferTitle.MediaUpload,
			TransferTitle.of(updatesThisApp = true, kind = null, purpose = TransferTitle.MEDIA_UPLOAD),
		)
		assertEquals(
			TransferTitle.MediaUpload,
			TransferTitle.of(updatesThisApp = false, kind = "install", purpose = TransferTitle.MEDIA_UPLOAD),
		)
	}

	@Test
	fun `an unknown purpose leaves the download titles alone`() {
		assertEquals(TransferTitle.AppUpdate, TransferTitle.of(updatesThisApp = true, kind = null, purpose = "sideload"))
	}

	@Test
	fun `a title survives the trip through an intent extra`() {
		TransferTitle.entries.forEach { title ->
			assertEquals(title, TransferTitle.named(title.name))
		}
	}

	@Test
	fun `a missing or unknown extra falls back to the update title`() {
		assertEquals(TransferTitle.AppUpdate, TransferTitle.named(null))
		assertEquals(TransferTitle.AppUpdate, TransferTitle.named("Sideload"))
	}
}
