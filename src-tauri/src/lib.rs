pub mod api;
mod error;
mod state;
mod storage;

use std::sync::OnceLock;

use tauri::Manager;

use crate::state::AppState;
use crate::storage::{AuthStorage, DeviceStorage, SigningKeyStorage};

// Mirrors MIN_SUPPORTED_WEBVIEW_MAJOR in gen/android/app/build.gradle.kts and the
// CSS feature floor in src/app.html (Tailwind v4: Chromium 111 / WebKitGTK 2.42 /
// Safari 16.4). Keep in sync.
#[cfg(target_os = "windows")]
const MIN_CHROMIUM_MAJOR: u32 = 111;
#[cfg(target_os = "linux")]
const MIN_WEBKITGTK: (u32, u32) = (2, 42);

const OPEN_GRIND_PLATFORM: &str = if cfg!(target_os = "android") {
    "android"
} else if cfg!(target_os = "ios") {
    "ios"
} else if cfg!(target_os = "windows") {
    "windows"
} else if cfg!(target_os = "macos") {
    "macos"
} else if cfg!(target_os = "linux") {
    "linux"
} else {
    "unknown"
};

fn open_grind_platform_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::<R, ()>::new("open-grind-platform")
        .js_init_script(format!(
            r#"window.__OPEN_GRIND_PLATFORM = "{OPEN_GRIND_PLATFORM}";"#
        ))
        .build()
}

// macOS reports a WebKit build number that doesn't track Safari versions
#[cfg(desktop)]
fn outdated_webview_notice() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let version = tauri::webview_version().ok()?;
        if version.split('.').next()?.parse::<u32>().ok()? < MIN_CHROMIUM_MAJOR {
            return Some(format!(
                "Open Grind needs Microsoft Edge WebView2 {MIN_CHROMIUM_MAJOR} or newer to \
                 display correctly (found {version}).\n\nUpdate the WebView2 Runtime, then \
                 restart the app."
            ));
        }
    }

    #[cfg(target_os = "linux")]
    {
        let version = tauri::webview_version().ok()?;
        let mut parts = version.split('.');
        let major = parts.next()?.parse::<u32>().ok()?;
        let minor = parts
            .next()
            .and_then(|p| p.parse::<u32>().ok())
            .unwrap_or(0);
        if (major, minor) < MIN_WEBKITGTK {
            let (min_major, min_minor) = MIN_WEBKITGTK;
            return Some(format!(
                "Open Grind needs WebKitGTK {min_major}.{min_minor} or newer to display \
                 correctly (found {version}).\n\nUpdate webkit2gtk / your distribution, \
                 then restart the app."
            ));
        }
    }

    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    let devtools = tauri_plugin_devtools::init();

    let builder = tauri::Builder::default();

    #[cfg(debug_assertions)]
    let builder = builder.plugin(devtools);

    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_android_fs::init());

    builder
        .plugin(open_grind_platform_plugin())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_geolocation::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(api::google_oauth::plugin())
        .manage(AppState {
            client: OnceLock::new(),
        })
        .invoke_handler(tauri::generate_handler![
            api::auth::login,
            api::auth::login_with_google,
            api::auth::google_sign_in,
            api::auth::refresh_token,
            api::auth::logout,
            api::auth::auth_state,
            api::auth::account_restriction,
            api::auth::recaptcha_first_party_enabled,
            api::rest::request,
            api::media_upload::upload_chat_media,
            api::ws::ws_connect,
            api::ws::ws_send,
            api::client::rotate_api_params,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            if let Some(message) = outdated_webview_notice() {
                use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                app.dialog()
                    .message(message)
                    .title("WebView may be too old")
                    .kind(MessageDialogKind::Warning)
                    .show(|_| {});
            }

            #[cfg(all(target_os = "macos", not(feature = "keychain")))]
            storage::init_file_store(app.path().app_data_dir()?);

            storage::init_keyring();

            let device = match DeviceStorage::load() {
                Ok(Some(d)) => d,
                Ok(None) => {
                    let d = grindr::DeviceInfo::generate();
                    if let Err(e) = DeviceStorage::save(&d) {
                        eprintln!("[setup] could not persist device info: {e}");
                    }
                    d
                }
                Err(e) => {
                    eprintln!("[setup] could not load device info, regenerating: {e}");
                    grindr::DeviceInfo::generate()
                }
            };

            let session = match AuthStorage::get_session() {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[setup] could not load session: {e}");
                    None
                }
            };

            let client =
                grindr::GrindrClient::new(device, session).expect("failed to build GrindrClient");

            {
                let mut session_rx = client.session_receiver();
                tauri::async_runtime::spawn(async move {
                    while session_rx.changed().await.is_ok() {
                        match session_rx.borrow().as_ref() {
                            Some(s) => {
                                if let Err(e) = AuthStorage::set_session(s) {
                                    eprintln!("[session] persist failed: {e}");
                                }
                            }
                            None => AuthStorage::delete_session(),
                        }
                    }
                });
            }

            {
                let saved_key = SigningKeyStorage::load().unwrap_or(None);
                let client = client.clone();
                let mut key_rx = client.signing_key_receiver();
                tauri::async_runtime::spawn(async move {
                    if let Some(k) = saved_key {
                        client.restore_signing_key(k).await;
                    }
                    while key_rx.changed().await.is_ok() {
                        match key_rx.borrow().clone() {
                            Some(k) => {
                                if let Err(e) = SigningKeyStorage::save(&k) {
                                    eprintln!("[signing] persist failed: {e}");
                                }
                            }
                            None => SigningKeyStorage::delete(),
                        }
                    }
                });
            }

            app.state::<AppState>()
                .client
                .set(client)
                .ok()
                .expect("client already set");

            api::ws::spawn_ws_task(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
