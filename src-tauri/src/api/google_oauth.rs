use std::sync::Arc;

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::{oneshot, Mutex};

use crate::error::AppError;

const HELPER_URL: &str = "https://web.grindr.com/";
const WINDOW_LABEL: &str = "google-oauth";

const INIT_SCRIPT: &str = r#"
(function() {
    'use strict';

    const GRINDR_WEB_CLIENT_ID = '1036042917246-htcnf9mm3qnis86l47ngp0a9ncqsll7j.apps.googleusercontent.com';

    function tauri(cmd, args) {
        try { return window.__TAURI_INTERNALS__.invoke(cmd, args); }
        catch (e) { console.error('[oauth] tauri invoke failed', e); return Promise.resolve(); }
    }
    function reportError(msg) { return tauri('google_oauth_error', { error: msg }); }
    function reportToken(token) { return tauri('google_oauth_token_captured', { token: token }); }

    async function loadGisSdk() {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client';
            s.async = true;
            s.onload = resolve;
            s.onerror = () => reject(new Error('GIS SDK failed to load'));
            (document.head || document.documentElement).appendChild(s);
        });
        for (let i = 0; i < 100; i++) {
            if (window.google && window.google.accounts && window.google.accounts.oauth2) return;
            await new Promise(r => setTimeout(r, 50));
        }
        throw new Error('GIS SDK initialize fail');
    }

    async function run() {
        try {
            document.write("");

            await loadGisSdk();

            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: GRINDR_WEB_CLIENT_ID,
                scope: 'email profile',
                callback: (response) => {
                    if (response && response.access_token) {
                        reportToken(response.access_token);
                    } else {
                        reportError('no access_token in response: ' + JSON.stringify(response || {}));
                    }
                },
                error_callback: (err) => {
                    reportError('token client error: ' + JSON.stringify(err || {}));
                }
            });

            tokenClient.requestAccessToken({ prompt: 'select_account' });
        } catch (e) {
            reportError(String((e && e.message) || e));
        }
    }

    run();
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
}

pub async fn fetch_google_access_token(app: &AppHandle) -> Result<String, AppError> {
    let bridge = app.state::<Arc<GoogleOauthBridge>>().inner().clone();

    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    {
        let mut pending = bridge.pending.lock().await;
        if pending.is_some() {
            return Err(AppError::Auth(
                "Google sign-in already in progress".into(),
            ));
        }
        *pending = Some(tx);
    }

    if let Some(existing) = app.get_webview_window(WINDOW_LABEL) {
        let _ = existing.close();
    }

    let url = Url::parse(HELPER_URL)
        .map_err(|e| AppError::Http(format!("invalid helper URL: {e}")))?;

    let window = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(url))
        .title("Sign in with Google")
        .inner_size(460.0, 720.0)
        .resizable(false)
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 \
             (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        )
        .initialization_script(INIT_SCRIPT)
        .build()
        .map_err(|e| {
            let bridge_drain = bridge.clone();
            tauri::async_runtime::spawn(async move {
                let mut pending = bridge_drain.pending.lock().await;
                let _ = pending.take();
            });
            AppError::Http(format!("failed to open sign-in window: {e}"))
        })?;

    let bridge_for_close = bridge.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
            let bridge = bridge_for_close.clone();
            tauri::async_runtime::spawn(async move {
                let mut pending = bridge.pending.lock().await;
                if let Some(tx) = pending.take() {
                    let _ = tx.send(Err("Sign-in cancelled".to_string()));
                }
            });
        }
    });

    let result = rx
        .await
        .map_err(|_| AppError::Auth("sign-in flow ended unexpectedly".into()))?;

    let _ = window.close();

    result.map_err(AppError::Auth)
}

#[tauri::command]
pub async fn google_oauth_token_captured(
    token: String,
    bridge: tauri::State<'_, Arc<GoogleOauthBridge>>,
) -> Result<(), String> {
    let mut pending = bridge.pending.lock().await;
    if let Some(tx) = pending.take() {
        let _ = tx.send(Ok(token));
    }
    Ok(())
}

#[tauri::command]
pub async fn google_oauth_error(
    error: String,
    bridge: tauri::State<'_, Arc<GoogleOauthBridge>>,
) -> Result<(), String> {
    let mut pending = bridge.pending.lock().await;
    if let Some(tx) = pending.take() {
        let _ = tx.send(Err(error));
    }
    Ok(())
}