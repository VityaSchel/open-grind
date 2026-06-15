package org.opengrind

import android.util.Log
import android.webkit.WebView
import androidx.webkit.UserAgentMetadata
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

/**
 * Google blocks OAuth from Android's WebView even when the User-Agent *string* is
 * spoofed to desktop Safari, because Chromium still sends User-Agent Client Hints
 * (`sec-ch-ua`) that announce the `"Android WebView"` brand + `sec-ch-ua-mobile: ?1`
 * + `sec-ch-ua-platform: "Android"`. `setUserAgentString` can't change those.
 *
 * This overrides the client-hint metadata so the webview presents as desktop
 * Chrome on macOS, matching the spoofed UA string used for the OAuth window.
 * Called from Rust (see `google_oauth.rs`) on the OAuth webview before it
 * navigates to Google.
 */
object OAuthClientHints {
    @JvmStatic
    fun apply(webView: WebView) {
        try {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) {
                Log.w("OAuthClientHints", "USER_AGENT_METADATA not supported on this WebView")
                return
            }

            val brands = listOf(
                UserAgentMetadata.BrandVersion.Builder()
                    .setBrand("Chromium").setMajorVersion("148").setFullVersion("148.0.0.0").build(),
                UserAgentMetadata.BrandVersion.Builder()
                    .setBrand("Google Chrome").setMajorVersion("148").setFullVersion("148.0.0.0").build(),
                UserAgentMetadata.BrandVersion.Builder()
                    .setBrand("Not.A/Brand").setMajorVersion("99").setFullVersion("99.0.0.0").build()
            )

            // Present a fully consistent desktop Chrome on macOS. Anything that
            // still looks like Android (model "sdk_gphone64_arm64", form-factor
            // "Mobile") is an inconsistency Google can flag, so override it all.
            val metadata = UserAgentMetadata.Builder()
                .setBrandVersionList(brands)
                .setFullVersion("148.0.0.0")
                .setPlatform("macOS")
                .setPlatformVersion("10_15_7")
                .setArchitecture("x86")
                .setBitness(64)
                .setWow64(false)
                .setModel("")
                .setMobile(false)
                .setFormFactors(listOf("Desktop"))
                .build()

            WebSettingsCompat.setUserAgentMetadata(webView.settings, metadata)
            Log.i("OAuthClientHints", "applied desktop Chrome UA client hints")
        } catch (e: Throwable) {
            Log.e("OAuthClientHints", "failed to set UA metadata", e)
        }
    }
}
