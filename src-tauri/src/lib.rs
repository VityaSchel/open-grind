pub mod api;
mod error;
mod state;
mod storage;

use std::sync::{Arc, OnceLock};

use tauri::Manager;

use crate::state::AppState;
use crate::storage::{AuthStorage, DeviceStorage};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    let devtools = tauri_plugin_devtools::init();

    let mut builder = tauri::Builder::default();

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(devtools);
    }

    builder
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_geolocation::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            client: OnceLock::new(),
        })
        .manage(Arc::new(api::google_oauth::GoogleOauthBridge::new()))
        .invoke_handler(tauri::generate_handler![
            api::auth::login,
            api::auth::login_with_google,
            api::auth::refresh_token,
            api::auth::logout,
            api::auth::auth_state,
            api::auth::recaptcha_first_party_enabled,
            api::rest::request,
            api::ws::ws_connect,
            api::ws::ws_send,
            api::client::rotate_api_params,
        ])
        .setup(|app| {
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
