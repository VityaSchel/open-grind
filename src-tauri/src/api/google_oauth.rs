use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

use crate::error::AppError;

const HELPER_URL: &str = "https://web.grindr.com/";
const WINDOW_LABEL: &str = "google-oauth";

// Desktop WKWebView slips past Google's embedded-webview check because its UA
// already looks like Safari. Android's Chromium WebView is rejected even with a
// spoofed UA string, because it sends User-Agent Client Hints (`sec-ch-ua`)
// announcing the "Android WebView" brand. There we pose as desktop Chrome and
// also rewrite the client-hint metadata natively (`apply_android_ua_hints`).
#[cfg(target_os = "android")]
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
     AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
#[cfg(not(target_os = "android"))]
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
     AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

// The flow reports its result by navigating the (web.grindr.com) document to this
// path. A top-level navigation isn't subject to the page's CSP `connect-src` and
// needs no command ACL (unlike Tauri's `ipc://` bridge, which web.grindr.com's CSP
// blocks and which is denied to remote origins), and the navigation handler is
// supported on desktop *and* Android. Rust intercepts it in `on_navigation`.
const RESULT_PATH: &str = "/__open_grind_oauth__";

// Injected at document-start into every page of this webview (on Android via
// `addDocumentStartJavaScript(..., setOf("*"))`, on desktop via a WKUserScript).
//
// Why this shape: Grindr's web OAuth client only trusts `https://web.grindr.com`
// as a JavaScript origin, so we must run the flow from that origin. GIS would open
// the Google account-chooser in a popup (`window.open`) and receive the token via
// `window.opener.postMessage`. Popups aren't portable — Android's WebView has no
// `onCreateWindow`, and Google's pages send `X-Frame-Options: DENY` so they can't
// be embedded in an iframe either. The portable approach is to drive Google
// *top-level in this same webview*:
//
//   * On web.grindr.com: run GIS, but polyfill `window.open` so its popup attempt
//     navigates this webview to the Google URL instead.
//   * On accounts.google.com: a top-level navigation has no opener, so install a
//     fake `window.opener`; Google's relay posts the token straight into it. We
//     then forward the token to Rust via the sentinel navigation.
const INIT_SCRIPT: &str = r#"
(function() {
    'use strict';

    var HELPER_ORIGIN = 'https://web.grindr.com';
    var GOOGLE_ORIGIN = 'https://accounts.google.com';
    var SENTINEL = HELPER_ORIGIN + '/__open_grind_oauth__';
    var CLIENT_ID = '1036042917246-htcnf9mm3qnis86l47ngp0a9ncqsll7j.apps.googleusercontent.com';

    function forward(params) {
        try { location.replace(SENTINEL + '?' + params); } catch (e) {}
    }
    function forwardToken(token) { forward('token=' + encodeURIComponent(token)); }
    function forwardError(msg) { forward('error=' + encodeURIComponent(String(msg))); }

    // Best-effort: pull an OAuth access token out of whatever shape the relay posts
    // (string, JSON string, nested object/array, or a fragment-like string).
    function extractToken(data) {
        var found = null;
        function fromString(s) {
            var m = /access_token["'\s]*[=:]\s*["']?([^"'&\s\\)}\]]+)/i.exec(s);
            return m ? decodeURIComponent(m[1]) : null;
        }
        function walk(v, depth) {
            if (found || v == null || depth > 6) return;
            if (typeof v === 'string') {
                if (v.indexOf('access_token') === -1) return;
                var t = fromString(v);
                if (t) { found = t; return; }
                try { walk(JSON.parse(v), depth + 1); } catch (e) {}
                return;
            }
            if (typeof v === 'object') {
                if (typeof v.access_token === 'string') { found = v.access_token; return; }
                for (var k in v) {
                    try { walk(v[k], depth + 1); } catch (e) {}
                    if (found) return;
                }
            }
        }
        if (typeof data === 'string') {
            var direct = fromString(data);
            if (direct) return direct;
            try { walk(JSON.parse(data), 0); } catch (e) { walk(data, 0); }
        } else {
            walk(data, 0);
        }
        return found;
    }

    // Android WebView appends `X-Requested-With: <app package>` to requests, which
    // flags the page as an embedded app webview to Google. It only does so when JS
    // hasn't set the header, so force it on every XHR/fetch (this covers the
    // batchexecute request Google rejects on). Static resource loads still leak it
    // — only a native request proxy could strip those.
    (function maskRequestedWith() {
        var HDR = 'X-Requested-With';
        try {
            var open = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function() {
                var ret = open.apply(this, arguments);
                try { this.setRequestHeader(HDR, ''); } catch (e) {}
                return ret;
            };
        } catch (e) {}
        try {
            var nativeFetch = window.fetch;
            if (nativeFetch) {
                window.fetch = function(input, init) {
                    try {
                        var headers = new Headers();
                        if (input && typeof input === 'object' && input.headers) {
                            input.headers.forEach(function(v, k) { headers.set(k, v); });
                        }
                        if (init && init.headers) {
                            new Headers(init.headers).forEach(function(v, k) { headers.set(k, v); });
                        }
                        headers.set(HDR, '');
                        init = Object.assign({}, init, { headers: headers });
                    } catch (e) {}
                    return nativeFetch.call(this, input, init);
                };
            }
        } catch (e) {}
    })();

    // ===================== Google side: catch the relay =====================
    if (location.origin === GOOGLE_ORIGIN) {
        var captured = false;
        function handle(data) {
            if (captured) return;
            try { console.log('[oauth] relay message:', typeof data === 'string' ? data : JSON.stringify(data)); } catch (e) {}
            var t = extractToken(data);
            if (t) { captured = true; forwardToken(t); }
        }

        var openerStub = {
            closed: false,
            focus: function () {},
            blur: function () {},
            close: function () { this.closed = true; },
            postMessage: function (data) { handle(data); }
        };

        // The account-chooser was built for popup mode (it posts the token to
        // window.opener). We arrived here via a top-level navigation, so there is
        // no real opener — supply a stub that captures the postMessage.
        try { window.opener = openerStub; } catch (e) {}
        if (window.opener !== openerStub) {
            try {
                Object.defineProperty(window, 'opener', {
                    configurable: true,
                    get: function () { return openerStub; },
                    set: function () {}
                });
            } catch (e) {}
        }

        // Fallback for relays that broadcast via a normal message event.
        try { window.addEventListener('message', function (ev) { handle(ev.data); }, true); } catch (e) {}
        return;
    }

    // ===================== Helper side: web.grindr.com =====================
    if (location.origin !== HELPER_ORIGIN) return;

    // We only want the origin, not Grindr's SPA: stop its load and blank the page.
    try { window.stop(); } catch (e) {}

    function shell(inner) {
        try {
            document.documentElement.innerHTML =
                '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
                '<title>Sign in with Google</title></head>' +
                '<body style="margin:0;min-height:100vh;display:flex;align-items:center;' +
                'justify-content:center;background:#1e1e1e;color:#ddd;' +
                'font:14px -apple-system,system-ui,sans-serif">' + inner + '</body>';
        } catch (e) {}
    }

    // DIAGNOSTIC: surface the effective User-Agent (the prime suspect for Android's
    // "this browser or app may not be secure") and gate the flow on a tap so it can
    // be read on-device. The tap also gives the navigation a user gesture.
    function showStart() {
        shell(
            '<div style="max-width:92%;text-align:center">' +
            '<p style="font-size:16px;margin:0 0 16px">Sign in with Google</p>' +
            '<button id="og-go" style="appearance:none;border:0;border-radius:8px;' +
            'padding:12px 22px;font-size:15px;background:#3b82f6;color:#fff">Continue</button>' +
            '<p style="margin:20px 0 6px;color:#888;font-size:11px">User-Agent seen by Google:</p>' +
            '<pre style="font-size:10px;color:#7a7a7a;white-space:pre-wrap;word-break:break-all;margin:0">' +
            String(navigator.userAgent).replace(/[<>]/g, '') + '</pre>' +
            '</div>'
        );
        var btn = document.getElementById('og-go');
        if (btn) btn.addEventListener('click', run);
    }

    var navigated = false;
    function navigateTop(url) {
        if (navigated || !url) return;
        url = String(url);
        if (!url || url === 'about:blank') return;
        navigated = true;
        try { location.assign(url); } catch (e) { forwardError(e); }
    }

    // GIS shows the account chooser with `window.open`. With a single webview we
    // can't host a popup, so navigate this webview to the same URL instead. Handle
    // both `window.open(url)` and the `w.location = url` / `w.location.href = url`
    // patterns a library might use.
    window.open = function (url) {
        navigateTop(url);
        var loc = { assign: navigateTop, replace: navigateTop };
        try { Object.defineProperty(loc, 'href', { get: function () { return ''; }, set: navigateTop }); } catch (e) {}
        return {
            closed: false,
            focus: function () {}, blur: function () {}, close: function () {},
            postMessage: function () {},
            get location() { return loc; },
            set location(v) { navigateTop(v); }
        };
    };

    async function loadGisSdk() {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) return;
        await new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client';
            s.async = true;
            s.onload = resolve;
            s.onerror = function () { reject(new Error('GIS SDK failed to load')); };
            (document.head || document.documentElement).appendChild(s);
        });
        for (var i = 0; i < 100; i++) {
            if (window.google && window.google.accounts && window.google.accounts.oauth2) return;
            await new Promise(function (r) { setTimeout(r, 50); });
        }
        throw new Error('GIS SDK initialize failed');
    }

    async function run() {
        try {
            shell('<div>Connecting to Google…</div>');
            await loadGisSdk();
            var tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: 'email profile',
                callback: function (response) {
                    // Only reached if an opener relay happens to survive; harmless.
                    if (response && response.access_token) forwardToken(response.access_token);
                },
                error_callback: function (err) { forwardError('token client error: ' + JSON.stringify(err || {})); }
            });
            tokenClient.requestAccessToken({ prompt: 'select_account' });
        } catch (e) {
            forwardError((e && e.message) || e);
        }
    }

    showStart();
})();
"#;

pub struct GoogleOauthBridge {
    pending: Mutex<Option<oneshot::Sender<Result<String, String>>>>,
}

impl GoogleOauthBridge {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(None),
        }
    }

    fn fulfill(&self, result: Result<String, String>) {
        if let Some(tx) = self.pending.lock().unwrap().take() {
            let _ = tx.send(result);
        }
    }
}

// Rewrites the OAuth webview's User-Agent Client Hints so Chromium stops
// advertising itself as "Android WebView" (which Google rejects). Runs on the
// webview thread before the user proceeds to Google. See `OAuthClientHints.kt`.
#[cfg(target_os = "android")]
fn apply_android_ua_hints(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|platform_webview| {
        platform_webview.jni_handle().exec(|env, activity, webview| {
            if let Err(e) = set_ua_metadata(env, activity, webview) {
                // A failed JNI call leaves a pending Java exception; if it isn't
                // cleared, ART aborts the process. Degrade gracefully instead.
                if env.exception_check().unwrap_or(false) {
                    let _ = env.exception_describe();
                    let _ = env.exception_clear();
                }
                eprintln!("[oauth] failed to apply UA client hints: {e:?}");
            }
        });
    });
}

#[cfg(target_os = "android")]
fn set_ua_metadata(
    env: &mut jni::JNIEnv,
    activity: &jni::objects::JObject,
    webview: &jni::objects::JObject,
) -> jni::errors::Result<()> {
    use jni::objects::{JClass, JObject, JValue};

    // `FindClass` on this thread uses the system class loader, which can't see
    // app classes, so resolve `OAuthClientHints` via the activity's loader.
    let loader = env
        .call_method(activity, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])?
        .l()?;
    let class_name = env.new_string("org.opengrind.OAuthClientHints")?;
    let class_name_ref: &JObject = class_name.as_ref();
    let class_obj = env
        .call_method(
            &loader,
            "loadClass",
            "(Ljava/lang/String;)Ljava/lang/Class;",
            &[JValue::Object(class_name_ref)],
        )?
        .l()?;
    let class = unsafe { JClass::from_raw(class_obj.into_raw()) };

    env.call_static_method(
        &class,
        "apply",
        "(Landroid/webkit/WebView;)V",
        &[JValue::Object(webview)],
    )?;
    Ok(())
}

pub async fn fetch_google_access_token(app: &AppHandle) -> Result<String, AppError> {
    let bridge = app.state::<Arc<GoogleOauthBridge>>().inner().clone();

    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    {
        let mut pending = bridge.pending.lock().unwrap();
        if pending.is_some() {
            return Err(AppError::Auth("Google sign-in already in progress".into()));
        }
        *pending = Some(tx);
    }

    if let Some(existing) = app.get_webview_window(WINDOW_LABEL) {
        let _ = existing.close();
    }

    let url = Url::parse(HELPER_URL).map_err(|e| {
        bridge.fulfill(Err(format!("invalid helper URL: {e}")));
        AppError::Http(format!("invalid helper URL: {e}"))
    })?;

    let bridge_for_nav = bridge.clone();
    let window = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(url))
        .title("Sign in with Google")
        .inner_size(500.0, 720.0)
        .user_agent(USER_AGENT)
        .initialization_script(INIT_SCRIPT)
        // Intercept the flow's result navigation (see `RESULT_PATH`).
        .on_navigation(move |url| {
            if url.host_str() != Some("web.grindr.com") || url.path() != RESULT_PATH {
                return true;
            }
            for (key, value) in url.query_pairs() {
                match key.as_ref() {
                    "token" => bridge_for_nav.fulfill(Ok(value.into_owned())),
                    "error" => bridge_for_nav.fulfill(Err(value.into_owned())),
                    _ => {}
                }
            }
            false
        })
        .build()
        .map_err(|e| {
            bridge.fulfill(Err(format!("failed to open sign-in window: {e}")));
            AppError::Http(format!("failed to open sign-in window: {e}"))
        })?;

    #[cfg(target_os = "android")]
    apply_android_ua_hints(&window);

    let bridge_for_close = bridge.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
            bridge_for_close.fulfill(Err("Sign-in cancelled".to_string()));
        }
    });

    let result = rx
        .await
        .map_err(|_| AppError::Auth("sign-in flow ended unexpectedly".into()))?;

    let _ = window.close();

    result.map_err(AppError::Auth)
}
