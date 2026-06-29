//! Interactive sign-in via Google's EmbeddedSetup page (Android only). A
//! permissive `window.mm` shim keeps the page running; the `oauth_token` cookie is
//! HttpOnly, so it's polled out natively with `CookieManager` rather than from JS.

#![cfg(target_os = "android")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

use crate::error::AppError;

use super::constants::{ACCOUNTS_ORIGIN, EMBEDDED_SETUP_UA, EMBEDDED_SETUP_URL, WINDOW_LABEL};
use super::GoogleOauthBridge;

const POLL_INTERVAL: Duration = Duration::from_millis(1500);
const OVERALL_TIMEOUT: Duration = Duration::from_secs(300);

pub async fn capture_oauth_token(
    app: &AppHandle,
    android_id: &str,
    bridge: Arc<GoogleOauthBridge>,
) -> Result<String, AppError> {
    let rx = bridge.begin()?;

    if let Some(existing) = app.get_webview_window(WINDOW_LABEL) {
        let _ = existing.close();
    }

    let url = Url::parse(EMBEDDED_SETUP_URL).map_err(|e| {
        bridge.fulfill(Err(format!("invalid EmbeddedSetup URL: {e}")));
        AppError::Http(format!("invalid EmbeddedSetup URL: {e}"))
    })?;

    let window = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(url))
        .title("Sign in with Google")
        .inner_size(460.0, 720.0)
        .user_agent(EMBEDDED_SETUP_UA)
        .initialization_script(&init_script(android_id))
        .build()
        .map_err(|e| {
            bridge.fulfill(Err(format!("failed to open sign-in window: {e}")));
            AppError::Http(format!("failed to open sign-in window: {e}"))
        })?;

    let bridge_for_close = bridge.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
            bridge_for_close.fulfill(Err("Sign-in cancelled".to_string()));
        }
    });

    let done = Arc::new(AtomicBool::new(false));
    {
        let app = app.clone();
        let bridge = bridge.clone();
        let done = done.clone();
        tauri::async_runtime::spawn(async move {
            while !done.load(Ordering::SeqCst) {
                tokio::time::sleep(POLL_INTERVAL).await;
                if done.load(Ordering::SeqCst) {
                    break;
                }
                match app.get_webview_window(WINDOW_LABEL) {
                    Some(window) => read_oauth_cookie(&window, &bridge, &done),
                    None => break,
                }
            }
        });
    }

    let outcome = tokio::time::timeout(OVERALL_TIMEOUT, rx).await;
    done.store(true, Ordering::SeqCst);
    let _ = window.close();

    match outcome {
        Ok(Ok(result)) => result.map_err(AppError::Auth),
        Ok(Err(_)) => Err(AppError::Auth("sign-in flow ended unexpectedly".into())),
        Err(_) => Err(AppError::Auth("Google sign-in timed out".into())),
    }
}

fn read_oauth_cookie(
    window: &tauri::WebviewWindow,
    bridge: &Arc<GoogleOauthBridge>,
    done: &Arc<AtomicBool>,
) {
    let bridge = bridge.clone();
    let done = done.clone();
    let _ = window.with_webview(move |platform_webview| {
        platform_webview.jni_handle().exec(move |env, _activity, _webview| {
            match jni_get_oauth_token(env) {
                Ok(Some(token)) => {
                    done.store(true, Ordering::SeqCst);
                    bridge.fulfill(Ok(token));
                }
                Ok(None) => {}
                Err(e) => {
                    // Clear any pending Java exception so ART doesn't abort.
                    if env.exception_check().unwrap_or(false) {
                        let _ = env.exception_clear();
                    }
                    eprintln!("[google_oauth] cookie read failed: {e:?}");
                }
            }
        });
    });
}

fn jni_get_oauth_token(env: &mut jni::JNIEnv) -> jni::errors::Result<Option<String>> {
    use jni::objects::{JObject, JString, JValue};

    let class = env.find_class("android/webkit/CookieManager")?;
    let manager = env
        .call_static_method(
            &class,
            "getInstance",
            "()Landroid/webkit/CookieManager;",
            &[],
        )?
        .l()?;

    let url = env.new_string(ACCOUNTS_ORIGIN)?;
    let url_ref: &JObject = url.as_ref();
    let cookies_obj = env
        .call_method(
            &manager,
            "getCookie",
            "(Ljava/lang/String;)Ljava/lang/String;",
            &[JValue::Object(url_ref)],
        )?
        .l()?;

    if cookies_obj.is_null() {
        return Ok(None);
    }

    let cookies: String = env.get_string(&JString::from(cookies_obj))?.into();
    Ok(parse_oauth_token(&cookies))
}

fn parse_oauth_token(cookie_header: &str) -> Option<String> {
    cookie_header
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find(|(name, _)| *name == "oauth_token")
        .map(|(_, value)| value.to_owned())
}

fn init_script(android_id: &str) -> String {
    // android_id is hex, safe to inline into the script literal.
    format!(
        r#"
(function() {{
    'use strict';
    var ANDROID_ID = "{android_id}";
    function value(name) {{
        switch (name) {{
            case 'getAndroidId': return ANDROID_ID;
            case 'getBuildVersionSdk': return '34';
            case 'getPlayServicesVersionCode': return '240913000';
            case 'getAllowedDomains': return '[]';
            case 'getDeviceDataVersionInfo': return '';
            case 'getAccountManagementType': return '0';
            case 'isUserOwner': return true;
            case 'hasTelephony': return false;
            default: return '';
        }}
    }}
    var handler = {{
        get: function(_target, prop) {{
            if (typeof prop !== 'string') return undefined;
            return function() {{
                try {{
                    console.log('[mm] ' + prop + '(' +
                        Array.prototype.slice.call(arguments).join(',') + ')');
                }} catch (e) {{}}
                return value(prop);
            }};
        }}
    }};
    try {{ window.mm = new Proxy({{}}, handler); }} catch (e) {{}}
}})();
"#
    )
}

#[cfg(test)]
mod tests {
    use super::parse_oauth_token;

    #[test]
    fn extracts_oauth_token_among_other_cookies() {
        let header = "NID=abc; oauth_token=oauth2_4/xyz123; SID=def";
        assert_eq!(parse_oauth_token(header).as_deref(), Some("oauth2_4/xyz123"));
    }

    #[test]
    fn returns_none_when_absent() {
        assert_eq!(parse_oauth_token("NID=abc; SID=def"), None);
    }
}
