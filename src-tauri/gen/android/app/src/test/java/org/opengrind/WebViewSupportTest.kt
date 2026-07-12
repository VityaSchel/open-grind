package org.opengrind

import android.content.pm.PackageInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WebViewSupportTest {
	@Test
	fun `parses major version from dotted version string`() {
		assertEquals(83, WebViewSupport.parseMajorVersion("83.0.4103.106"))
	}

	@Test
	fun `returns null when version string is missing or invalid`() {
		assertNull(WebViewSupport.parseMajorVersion(null))
		assertNull(WebViewSupport.parseMajorVersion(""))
		assertNull(WebViewSupport.parseMajorVersion("beta"))
	}

	@Test
	fun `classifies older webview as warning`() {
		val packageInfo = PackageInfo().apply {
			packageName = "com.google.android.webview"
			versionName = "83.0.4103.106"
		}

		val status = WebViewSupport.evaluate(packageInfo, minSupportedMajor = 111)

		assertEquals(WebViewSupport.Disposition.WARNING, status.disposition)
		assertEquals(83, status.majorVersion)
	}

	@Test
	fun `classifies supported webview as supported`() {
		val packageInfo = PackageInfo().apply {
			packageName = "com.android.chrome"
			versionName = "124.0.6367.179"
		}

		val status = WebViewSupport.evaluate(packageInfo, minSupportedMajor = 111)

		assertEquals(WebViewSupport.Disposition.SUPPORTED, status.disposition)
		assertEquals(124, status.majorVersion)
	}

	@Test
	fun `treats unknown provider as supported to avoid false alarms`() {
		val status = WebViewSupport.evaluate(packageInfo = null, minSupportedMajor = 111)

		assertEquals(WebViewSupport.Disposition.SUPPORTED, status.disposition)
		assertNull(status.majorVersion)
		assertNull(status.packageName)
		assertNull(status.versionName)
	}

	@Test
	fun `treats unparseable version as supported`() {
		val packageInfo = PackageInfo().apply {
			packageName = "com.vendor.customwebview"
			versionName = "vendor-build"
		}

		val status = WebViewSupport.evaluate(packageInfo, minSupportedMajor = 111)

		assertEquals(WebViewSupport.Disposition.SUPPORTED, status.disposition)
		assertNull(status.majorVersion)
	}
}
