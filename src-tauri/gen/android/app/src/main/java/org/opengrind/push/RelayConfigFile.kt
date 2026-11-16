package org.opengrind.push

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileNotFoundException
import java.io.OutputStream

object RelayConfigFile {
	const val NAME = "config.json"
	const val MIME_TYPE = "application/json"

	private const val SHARE_DIRECTORY = "fcm-relay"
	private const val PROVIDER_SUFFIX = ".fileprovider"
	private val WRITE_MODES = listOf("wt", "rwt")

	fun saveIntent(): Intent =
		Intent(Intent.ACTION_CREATE_DOCUMENT)
			.addCategory(Intent.CATEGORY_OPENABLE)
			.setType(MIME_TYPE)
			.putExtra(Intent.EXTRA_TITLE, NAME)

	fun write(context: Context, uri: Uri, config: ByteArray) {
		truncatingStream(context, uri).use { it.write(config) }
	}

	fun shareIntent(context: Context, config: ByteArray): Intent {
		val directory = File(context.cacheDir, SHARE_DIRECTORY).apply { mkdirs() }
		val file = File(directory, NAME)
		file.writeBytes(config)
		val uri = FileProvider.getUriForFile(context, context.packageName + PROVIDER_SUFFIX, file)
		val send = Intent(Intent.ACTION_SEND)
			.setType(MIME_TYPE)
			.putExtra(Intent.EXTRA_STREAM, uri)
			.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
		send.clipData = ClipData.newRawUri("", uri)
		return Intent.createChooser(send, null)
	}

	fun delete(context: Context) {
		File(context.cacheDir, SHARE_DIRECTORY).deleteRecursively()
	}

	private fun truncatingStream(context: Context, uri: Uri): OutputStream {
		var refused: Exception? = null
		for (mode in WRITE_MODES) {
			try {
				context.contentResolver.openOutputStream(uri, mode)?.let { return it }
			} catch (e: FileNotFoundException) {
				refused = e
			} catch (e: IllegalArgumentException) {
				refused = e
			} catch (e: UnsupportedOperationException) {
				refused = e
			}
		}
		throw refused ?: FileNotFoundException(uri.toString())
	}
}
