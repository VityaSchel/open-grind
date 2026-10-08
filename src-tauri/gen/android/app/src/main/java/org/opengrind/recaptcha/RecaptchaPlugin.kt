package org.opengrind.recaptcha

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.opengrind.addon.AddonLaunchCheck
import org.opengrind.addon.AddonGate
import org.opengrind.launchForResult

@InvokeArg
internal class MintArgs {
	lateinit var action: String
}

@TauriPlugin
class RecaptchaPlugin(private val activity: Activity) : Plugin(activity) {

	@Command
	fun mintToken(invoke: Invoke) {
		try {
			val action = invoke.parseArgs(MintArgs::class.java).action
			val intent = Intent(MINT_TOKEN_ACTION)
				.setPackage(ADDON_PACKAGE)
				.putExtra(EXTRA_ACTION, action)
			when (AddonLaunchCheck.decide(activity, intent, ADDON_PACKAGE)) {
				AddonGate.Verdict.Launch -> activity.launchForResult(intent) { mintResult(invoke, it) }
				AddonGate.Verdict.Unavailable -> invoke.reject(ERROR_UNAVAILABLE)
				AddonGate.Verdict.Disabled -> invoke.reject(ERROR_DISABLED)
				AddonGate.Verdict.Untrusted -> invoke.reject(ERROR_UNTRUSTED)
			}
		} catch (e: Exception) {
			invoke.reject(ERROR_UNAVAILABLE)
		}
	}

	private fun mintResult(invoke: Invoke, result: ActivityResult) {
		val data = result.data
		if (result.resultCode == Activity.RESULT_OK) {
			val token = data?.getStringExtra(EXTRA_TOKEN)
			if (token.isNullOrEmpty()) {
				invoke.reject(ERROR_NO_TOKEN)
			} else {
				invoke.resolve(JSObject().apply { put("token", token) })
			}
			return
		}
		val refusal = data?.getStringExtra(EXTRA_ERROR)
		if (refusal.isNullOrEmpty()) {
			invoke.reject(ERROR_CANCELLED)
		} else {
			invoke.reject(refusal, data.getStringExtra(EXTRA_ERROR_DETAIL))
		}
	}

	private companion object {
		const val ADDON_PACKAGE = "org.opengrind.recaptcha"
		const val MINT_TOKEN_ACTION = "org.opengrind.recaptcha.action.MINT_TOKEN"
		const val EXTRA_ACTION = "org.opengrind.recaptcha.extra.ACTION"
		const val EXTRA_TOKEN = "org.opengrind.recaptcha.extra.TOKEN"
		const val EXTRA_ERROR = "org.opengrind.recaptcha.extra.ERROR"
		const val EXTRA_ERROR_DETAIL = "org.opengrind.recaptcha.extra.ERROR_DETAIL"

		const val ERROR_UNAVAILABLE = "recaptcha-unavailable"
		const val ERROR_UNTRUSTED = "recaptcha-untrusted"
		const val ERROR_DISABLED = "recaptcha-disabled"
		const val ERROR_CANCELLED = "cancelled"
		const val ERROR_NO_TOKEN = "no-token"
	}
}
