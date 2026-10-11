package org.opengrind.picker

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.result.ActivityResult
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.opengrind.launchForResult

@InvokeArg
internal class PickMediaArgs {
	var mimeTypes: Array<String> = emptyArray()
	var multiple: Boolean = false
}

@TauriPlugin
class MediaPickerPlugin(private val activity: Activity) : Plugin(activity) {

	@Command
	fun pickMedia(invoke: Invoke) {
		if (!photoPickerHandlesGetContent()) {
			resolveUnsupported(invoke)
			return
		}
		val args = invoke.parseArgs(PickMediaArgs::class.java)
		val intent = Intent(Intent.ACTION_GET_CONTENT)
			.addCategory(Intent.CATEGORY_OPENABLE)
			.setType(ANY_TYPE)
			.putExtra(Intent.EXTRA_MIME_TYPES, args.mimeTypes)
			.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, args.multiple)
		try {
			activity.launchForResult(intent) { pickResult(invoke, it) }
		} catch (_: ActivityNotFoundException) {
			resolveUnsupported(invoke)
		}
	}

	private fun pickResult(invoke: Invoke, result: ActivityResult) {
		val uris = if (result.resultCode == Activity.RESULT_OK) pickedUris(result.data) else emptyList()
		invoke.resolve(JSObject().apply { put("uris", JSArray(uris.map(Uri::toString))) })
	}

	private fun pickedUris(data: Intent?): List<Uri> {
		val clipData = data?.clipData ?: return listOfNotNull(data?.data)
		return (0 until clipData.itemCount).mapNotNull { index -> clipData.getItemAt(index).uri }
	}

	private fun resolveUnsupported(invoke: Invoke) {
		invoke.resolve(JSObject().apply { put("supported", false) })
	}

	private fun photoPickerHandlesGetContent(): Boolean =
		Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ||
			Build.VERSION.SDK_INT == Build.VERSION_CODES.R

	private companion object {
		const val ANY_TYPE = "*/*"
	}
}
