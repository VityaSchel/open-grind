package org.opengrind

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import io.crates.keyring.Keyring

class MainActivity : TauriActivity() {
	private var insetsTop = 0
	private var insetsBottom = 0
	private var insetsLeft = 0
	private var insetsRight = 0
	@Volatile private var imeVisibleState = false
	private var webViewRef: WebView? = null
	private var pendingWebViewWarning: WebViewSupport.Status? = null
	private var shownWebViewWarning = false

	override val handleBackNavigation = false

	private val backGestureCallback = object : OnBackPressedCallback(true) {
		override fun handleOnBackPressed() {
			val webView = webViewRef
			if (webView == null) {
				fallThrough()
				return
			}
			webView.evaluateJavascript(
				"try { window.__AndroidOnBackGesture?.() } catch (error) { console.error(error); true; }"
			) { result ->
				if (result != "false") {
					if (webView.canGoBack()) webView.goBack() else fallThrough()
				}
			}
		}

		private fun fallThrough() {
			isEnabled = false
			onBackPressedDispatcher.onBackPressed()
			isEnabled = true
		}
	}

	inner class InsetsInterface {
		@JavascriptInterface fun top() = insetsTop
		@JavascriptInterface fun bottom() = insetsBottom
		@JavascriptInterface fun left() = insetsLeft
		@JavascriptInterface fun right() = insetsRight
		@JavascriptInterface fun imeVisible() = imeVisibleState
	}

	inner class BackInterface {
		@JavascriptInterface fun moveTaskToBack() {
			runOnUiThread { this@MainActivity.moveTaskToBack(true) }
		}
	}
	
	override fun onCreate(savedInstanceState: Bundle?) {
		enableEdgeToEdge()
		Keyring.initializeNdkContext(applicationContext)
		pendingWebViewWarning = WebViewSupport.current(
			context = this,
			minSupportedMajor = BuildConfig.MIN_SUPPORTED_WEBVIEW_MAJOR,
		).takeIf { it.disposition == WebViewSupport.Disposition.WARNING }
		super.onCreate(savedInstanceState)

		onBackPressedDispatcher.addCallback(this, backGestureCallback)

		WindowInsetsControllerCompat(window, window.decorView).apply {
			isAppearanceLightStatusBars = false
			isAppearanceLightNavigationBars = false
		}
		
		ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
			val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
			val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
			val isImeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
			imeVisibleState = isImeVisible
			val density = resources.displayMetrics.density
			
			insetsTop = (bars.top / density).toInt()
			insetsBottom = if (isImeVisible) 0 else (bars.bottom / density).toInt()
			insetsLeft = (bars.left / density).toInt()
			insetsRight = (bars.right / density).toInt()
			
			val bottomMargin = if (isImeVisible) ime.bottom else 0
			webViewRef?.let { wv ->
				(wv.layoutParams as? ViewGroup.MarginLayoutParams)?.let { params ->
					if (params.bottomMargin != bottomMargin) {
						params.bottomMargin = bottomMargin
						wv.layoutParams = params
					}
				}
			}
			
			webViewRef?.evaluateJavascript("window.__reapplyInsets?.()", null)
			
			ViewCompat.onApplyWindowInsets(view, insets)
		}
	}
	
	override fun onWebViewCreate(webView: WebView) {
		super.onWebViewCreate(webView)
		webViewRef = webView
		webView.settings.setGeolocationEnabled(false)
		webView.addJavascriptInterface(InsetsInterface(), "__AndroidInsets")
		webView.addJavascriptInterface(BackInterface(), "__AndroidBack")
		maybeWarnAboutWebView()
	}

	private fun maybeWarnAboutWebView() {
		val warning = pendingWebViewWarning ?: return
		val webView = webViewRef ?: return
		if (shownWebViewWarning) return
		shownWebViewWarning = true
		webView.visibility = WebView.INVISIBLE

		val view = layoutInflater.inflate(R.layout.dialog_webview_warning, null, false)
		view.findViewById<TextView>(R.id.dialog_message).text = buildWebViewWarningMessage(warning)

		val dialog = MaterialAlertDialogBuilder(this, R.style.ThemeOverlay_OpenGrind_WebViewDialog)
			.setView(view)
			.setCancelable(false)
			.create()

		view.findViewById<MaterialButton>(R.id.button_update).setOnClickListener {
			dialog.dismiss()
			openWebViewUpdate(warning)
			revealWebView()
		}
		view.findViewById<MaterialButton>(R.id.button_continue).setOnClickListener {
			dialog.dismiss()
			revealWebView()
		}

		dialog.show()
	}

	private fun revealWebView() {
		webViewRef?.visibility = WebView.VISIBLE
	}

	private fun buildWebViewWarningMessage(status: WebViewSupport.Status): String {
		val provider = status.packageName ?: "Unknown provider"
		val version = status.versionName ?: "Unknown version"
		return "Open Grind may not display correctly on older Android System WebView " +
			"versions. This build expects WebView ${status.minSupportedMajor} or newer.\n\n" +
			"Detected provider: $provider ($version)"
	}

	private fun openWebViewUpdate(status: WebViewSupport.Status) {
		val packageName = status.packageName
		val intents = buildList {
			if (packageName != null) {
				add(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName")))
				add(
					Intent(
						Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
						Uri.parse("package:$packageName"),
					),
				)
			}
			add(Intent(Settings.ACTION_SETTINGS))
		}

		for (intent in intents) {
			try {
				startActivity(intent)
				return
			} catch (_: ActivityNotFoundException) {
			}
		}
	}
}
