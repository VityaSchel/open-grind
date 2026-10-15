package org.opengrind.apporigin

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

internal class LocalStorageMove(
	context: Context,
	private val from: String,
	private val to: String,
	private val finish: () -> Unit,
) {
	private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
	private val done = "$from -> $to"
	private val handler = Handler(Looper.getMainLooper())
	private val webView by lazy {
		WebView(context).apply {
			settings.javaScriptEnabled = true
			settings.domStorageEnabled = true
		}
	}
	private var finished = false

	fun start() {
		if (preferences.getBoolean(done, false)) return finish()
		handler.postDelayed(::end, TIMEOUT_MS)
		open(from) { read(::moveFrom) }
	}

	private fun moveFrom(legacy: Map<String, String>) {
		if (legacy.isEmpty()) {
			preferences.edit().putBoolean(done, true).apply()
			return end()
		}
		open(to) {
			read { current ->
				write(entriesToCopy(legacy, current)) {
					read { copied -> removeFromLegacy(movedKeys(legacy, copied)) }
				}
			}
		}
	}

	private fun removeFromLegacy(keys: Set<String>) = open(from) { remove(keys, ::end) }

	private fun open(origin: String, then: () -> Unit) {
		webView.webViewClient = object : WebViewClient() {
			override fun onPageFinished(view: WebView, url: String?) {
				if (!finished) then()
			}
		}
		webView.loadDataWithBaseURL("$origin/", "", "text/html", "utf-8", null)
	}

	private fun read(then: (Map<String, String>) -> Unit) = evaluate(READ) { result ->
		val entries = (JSONTokener(result).nextValue() as? String)?.let(::JSONObject)
		if (entries == null) end()
		else then(entries.keys().asSequence().associateWith(entries::getString))
	}

	private fun write(entries: Map<String, String>, then: () -> Unit) = evaluate(
		"(entries => Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value)))(${JSONObject(entries)})"
	) { then() }

	private fun remove(keys: Set<String>, then: () -> Unit) = evaluate(
		"(keys => keys.forEach(key => localStorage.removeItem(key)))(${JSONArray(keys)})"
	) { then() }

	private fun evaluate(script: String, then: (String) -> Unit) =
		webView.evaluateJavascript(script) { result -> if (!finished) then(result) }

	private fun end() {
		if (finished) return
		finished = true
		handler.removeCallbacksAndMessages(null)
		handler.post { webView.destroy() }
		finish()
	}

	private companion object {
		const val PREFERENCES = "app-origin"
		const val TIMEOUT_MS = 3_000L
		const val READ =
			"JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])))"
	}
}
