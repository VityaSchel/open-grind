package org.opengrind.update

import org.junit.Assert.assertEquals
import org.junit.Test

class TransferTitleTest {
	private val googleOauth = TransferTitle.Addon.GoogleOauth
	private val recaptcha = TransferTitle.Addon.Recaptcha

	@Test
	fun `a download of this app is always an update`() {
		assertEquals(TransferTitle.AppUpdate, TransferTitle.of(updatesThisApp = true, addon = null, kind = "install"))
		assertEquals(TransferTitle.AppUpdate, TransferTitle.of(updatesThisApp = true, addon = null, kind = "update"))
	}

	@Test
	fun `an add-on that is not installed yet is downloaded for a first install`() {
		assertEquals(
			TransferTitle.GoogleOauthInstall,
			TransferTitle.of(updatesThisApp = false, addon = googleOauth, kind = "install"),
		)
		assertEquals(
			TransferTitle.RecaptchaInstall,
			TransferTitle.of(updatesThisApp = false, addon = recaptcha, kind = "install"),
		)
	}

	@Test
	fun `an installed add-on is downloaded as an update`() {
		assertEquals(
			TransferTitle.GoogleOauthUpdate,
			TransferTitle.of(updatesThisApp = false, addon = googleOauth, kind = "update"),
		)
		assertEquals(
			TransferTitle.RecaptchaUpdate,
			TransferTitle.of(updatesThisApp = false, addon = recaptcha, kind = "update"),
		)
	}

	@Test
	fun `an add-on download with an unknown kind never claims to be a first install`() {
		assertEquals(
			TransferTitle.GoogleOauthUpdate,
			TransferTitle.of(updatesThisApp = false, addon = googleOauth, kind = null),
		)
		assertEquals(
			TransferTitle.RecaptchaUpdate,
			TransferTitle.of(updatesThisApp = false, addon = recaptcha, kind = null),
		)
	}

	@Test
	fun `an unrecognized package gets the generic title instead of another add-on's name`() {
		assertEquals(TransferTitle.AppUpdate, TransferTitle.of(updatesThisApp = false, addon = null, kind = "install"))
		assertEquals(TransferTitle.AppUpdate, TransferTitle.of(updatesThisApp = false, addon = null, kind = "update"))
	}

	@Test
	fun `a media upload keeps its own title whatever the download fields say`() {
		assertEquals(
			TransferTitle.MediaUpload,
			TransferTitle.of(updatesThisApp = true, addon = null, kind = null, purpose = TransferTitle.MEDIA_UPLOAD),
		)
		assertEquals(
			TransferTitle.MediaUpload,
			TransferTitle.of(
				updatesThisApp = false,
				addon = TransferTitle.Addon.GoogleOauth,
				kind = "install",
				purpose = TransferTitle.MEDIA_UPLOAD,
			),
		)
	}

	@Test
	fun `an unknown purpose leaves the download titles alone`() {
		assertEquals(TransferTitle.AppUpdate, TransferTitle.of(updatesThisApp = true, addon = null, kind = null, purpose = "sideload"))
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
		assertEquals(TransferTitle.AppUpdate, TransferTitle.named("AddonInstall"))
	}
}
