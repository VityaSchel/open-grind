package org.opengrind

import android.app.Activity
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResult
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import java.util.UUID

// Tauri keeps one activity-result callback for every plugin, so a second launch strands the first. https://github.com/tauri-apps/tauri/issues/16122
fun Activity.launchForResult(intent: Intent, onResult: (ActivityResult) -> Unit) {
	check(!isDestroyed)
	lateinit var launcher: ActivityResultLauncher<Intent>
	launcher = (this as ComponentActivity).activityResultRegistry.register(
		"org.opengrind.result.${UUID.randomUUID()}",
		ActivityResultContracts.StartActivityForResult(),
	) { result ->
		launcher.unregisterAfterDispatch()
		onResult(result)
	}
	try {
		launcher.launch(intent)
	} catch (e: Exception) {
		launcher.unregister()
		throw e
	}
}

private fun ActivityResultLauncher<*>.unregisterAfterDispatch() {
	Handler(Looper.getMainLooper()).post { unregister() }
}
