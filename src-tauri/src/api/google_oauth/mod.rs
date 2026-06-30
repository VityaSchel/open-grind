//! Sign in with Google. The implementation is chosen at runtime: the native
//! ("microG-style") flow on Android + Chromium WebView, where Google blocks GIS,
//! and the GIS `web` flow everywhere else (the native flow also only compiles on
//! Android). Both yield an access token for Grindr's `/v8/sessions/thirdparty`.

mod constants;
mod protocol;
mod web;

#[cfg(target_os = "android")]
mod device;
#[cfg(target_os = "android")]
mod embedded;

use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager};
use tokio::sync::oneshot;

use crate::error::AppError;

// Shared by both flows; the sign-in WebView fulfills it with a token or error.
pub struct GoogleOauthBridge {
    pending: Mutex<Option<oneshot::Sender<Result<String, String>>>>,
}

impl GoogleOauthBridge {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(None),
        }
    }

    fn begin(&self) -> Result<oneshot::Receiver<Result<String, String>>, AppError> {
        let mut pending = self.pending.lock().unwrap();
        if pending.is_some() {
            return Err(AppError::Auth("Google sign-in already in progress".into()));
        }
        let (tx, rx) = oneshot::channel();
        *pending = Some(tx);
        Ok(rx)
    }

    fn fulfill(&self, result: Result<String, String>) {
        if let Some(tx) = self.pending.lock().unwrap().take() {
            let _ = tx.send(result);
        }
    }
}

pub async fn fetch_google_access_token(
    app: &AppHandle,
    chromium_webview: bool,
) -> Result<String, AppError> {
    let bridge = app.state::<Arc<GoogleOauthBridge>>().inner().clone();

    #[cfg(target_os = "android")]
    if chromium_webview {
        return fetch_native(app, bridge).await;
    }

    let _ = chromium_webview;
    web::fetch_access_token(app, bridge).await
}

#[cfg(target_os = "android")]
async fn fetch_native(
    app: &AppHandle,
    bridge: Arc<GoogleOauthBridge>,
) -> Result<String, AppError> {
    let mut device = device::GoogleDevice::load_or_create()?;

    // Reuse a cached master token to skip the webview when possible.
    if let (Some(master), Some(email)) = (device.master_token.clone(), device.email.clone()) {
        match protocol::exchange_access_token(&master, &email, &device.android_id).await {
            Ok(access) => return Ok(access),
            Err(e) => {
                eprintln!("[google_oauth] cached master token rejected ({e}); re-authenticating");
                device.clear_master();
            }
        }
    }

    let oauth_token = embedded::capture_oauth_token(app, &device.android_id, bridge).await?;
    eprintln!("[google_oauth] exchanging oauth_token for master token");
    let master = protocol::exchange_master_token(&oauth_token, &device.android_id)
        .await
        .inspect_err(|e| eprintln!("[google_oauth] master-token exchange failed: {e}"))?;
    eprintln!("[google_oauth] master token ok; exchanging for access token");
    let access = protocol::exchange_access_token(&master.token, &master.email, &device.android_id)
        .await
        .inspect_err(|e| eprintln!("[google_oauth] access-token exchange failed: {e}"))?;
    eprintln!("[google_oauth] access token ok");

    device.master_token = Some(master.token);
    device.email = Some(master.email);
    device.save()?;

    Ok(access)
}
