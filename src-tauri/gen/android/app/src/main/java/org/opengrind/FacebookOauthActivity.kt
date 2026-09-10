package org.opengrind

import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.lang.ref.WeakReference

private const val ISOLATED_PROFILE = "facebook-oauth"
private const val TAG = "FacebookOauth"

private fun isolatedProfileSupported() =
	WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)

class FacebookOauthActivity : TauriActivity() {

	override fun onCreate(savedInstanceState: Bundle?) {
		enableEdgeToEdge()
		if (isolatedProfileSupported()) {
			clearIsolatedProfile()
		} else {
			Log.w(TAG, "MULTI_PROFILE unsupported: sign-in shares the app cookie jar")
		}
		super.onCreate(savedInstanceState)
		live = WeakReference(this)
		val content = findViewById<View>(android.R.id.content)
		ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
			val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
			val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
			view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
			WindowInsetsCompat.CONSUMED
		}
	}

	override fun onWebViewCreate(webView: WebView) {
		super.onWebViewCreate(webView)
		webView.settings.setGeolocationEnabled(false)
		if (isolatedProfileSupported()) {
			runCatching {
				WebViewCompat.setProfile(webView, ISOLATED_PROFILE)
				Log.i(TAG, "sign-in webview isolated in profile $ISOLATED_PROFILE")
			}.onFailure { Log.w(TAG, "sign-in profile isolation failed", it) }
		}
		ViewCompat.requestApplyInsets(webView)
	}

	override fun onDestroy() {
		if (live?.get() === this) {
			live = null
		}
		super.onDestroy()
	}

	companion object {
		@Volatile
		private var live: WeakReference<FacebookOauthActivity>? = null

		fun clearIsolatedProfile() {
			if (!isolatedProfileSupported()) {
				return
			}
			runCatching {
				val profile =
					ProfileStore.getInstance().getOrCreateProfile(ISOLATED_PROFILE)
				profile.cookieManager.removeAllCookies(null)
				profile.webStorage.deleteAllData()
				Log.i(TAG, "cleared the isolated sign-in profile")
			}.onFailure { Log.w(TAG, "isolated sign-in profile not cleared", it) }
		}

		fun dismiss() {
			val activity = live?.get() ?: return
			activity.runOnUiThread {
				if (!activity.isFinishing && !activity.isDestroyed) {
					activity.finish()
				}
			}
		}
	}
}
