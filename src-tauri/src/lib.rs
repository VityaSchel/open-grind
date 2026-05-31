// `api` is `pub` so that `ci/fingerprint_check.rs` can reuse same header / client builders
pub mod api;
mod error;
mod state;
mod storage;

use std::sync::{Arc, OnceLock};
use tauri::Manager;
use tokio::sync::{mpsc, Notify};

use crate::state::AppState;
use api::client::GrindrClient;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    let devtools = tauri_plugin_devtools::init();

    let (ws_tx, ws_rx) = mpsc::channel(64);
    let auth_notify = Arc::new(Notify::new());

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
            ws_tx,
            ws_rx: tokio::sync::Mutex::new(Some(ws_rx)),
            auth_notify,
        })
        .invoke_handler(tauri::generate_handler![
            api::auth::login,
            api::auth::refresh_token,
            api::auth::logout,
            api::auth::auth_state,
            api::rest::request,
            api::ws::ws_connect,
            api::ws::ws_send,
            api::client::rotate_api_params,
        ])
        .setup(|app| {
            #[cfg(all(target_os = "macos", not(feature = "keychain")))]
            storage::init_file_store(app.path().app_data_dir()?);

            storage::init_keyring();

            if let Ok(client) = GrindrClient::new() {
                let _ = app.state::<AppState>().client.set(client);
            }

            if let Ok(client) = app.state::<AppState>().client() {
                client.set_app_handle(app.handle().clone());
            }

            #[cfg(all(target_os = "macos", not(feature = "keychain")))]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = handle.state::<AppState>();
                    if let Ok(client) = state.client() {
                        client.reload_session().await;
                        if client.authorization_header().await.is_some() {
                            state.auth_notify.notify_one();
                        }
                    }
                });
            }
            api::ws::spawn_ws_task(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
