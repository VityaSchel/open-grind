package org.opengrind.apporigin

import android.app.Activity
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
internal class HostArgs {
	lateinit var host: String
}

@InvokeArg
internal class MoveLocalStorageArgs {
	lateinit var from: String
	lateinit var to: String
}

@TauriPlugin
class AppOriginPlugin(private val activity: Activity) : Plugin(activity) {

	@Command
	fun exemptFromSafeBrowsing(invoke: Invoke) {
		val host = invoke.parseArgs(HostArgs::class.java).host
		if (!WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ALLOWLIST)) {
			invoke.resolve()
			return
		}
		WebViewCompat.setSafeBrowsingAllowlist(setOf(".$host")) { invoke.resolve() }
	}

	@Command
	fun moveLocalStorage(invoke: Invoke) {
		val args = invoke.parseArgs(MoveLocalStorageArgs::class.java)
		LocalStorageMove(activity, args.from, args.to) { invoke.resolve() }.start()
	}
}
