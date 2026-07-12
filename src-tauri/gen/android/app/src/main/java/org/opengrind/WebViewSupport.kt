package org.opengrind

import android.content.Context
import android.content.pm.PackageInfo
import androidx.webkit.WebViewCompat

object WebViewSupport {
	enum class Disposition {
		SUPPORTED,
		WARNING,
	}

	data class Status(
		val disposition: Disposition,
		val packageName: String?,
		val versionName: String?,
		val majorVersion: Int?,
		val minSupportedMajor: Int,
	)

	fun current(
		context: Context,
		minSupportedMajor: Int,
	): Status = evaluate(
		packageInfo = WebViewCompat.getCurrentWebViewPackage(context),
		minSupportedMajor = minSupportedMajor,
	)

	fun evaluate(
		packageInfo: PackageInfo?,
		minSupportedMajor: Int,
	): Status {
		val versionName = packageInfo?.versionName
		val majorVersion = parseMajorVersion(versionName)
		val outdated = majorVersion != null && majorVersion < minSupportedMajor

		return Status(
			disposition = if (outdated) Disposition.WARNING else Disposition.SUPPORTED,
			packageName = packageInfo?.packageName,
			versionName = versionName,
			majorVersion = majorVersion,
			minSupportedMajor = minSupportedMajor,
		)
	}

	fun parseMajorVersion(versionName: String?): Int? =
		versionName
			?.substringBefore('.')
			?.trim()
			?.takeIf { it.isNotEmpty() }
			?.toIntOrNull()
}
