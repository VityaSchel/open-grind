pub mod api;
mod appearance;
mod error;
pub mod media;
mod photo;
mod scroll_phase;
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

const MAIN_WINDOW_LABEL: &str = "main";

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

fn open_grind_platform_plugin<R: tauri::Runtime>(
) -> tauri::plugin::TauriPlugin<R> {
	tauri::plugin::Builder::<R, ()>::new("open-grind-platform")
		.js_init_script(format!(
			r#"window.__OPEN_GRIND_PLATFORM = "{OPEN_GRIND_PLATFORM}";"#
		))
		.build()
}

fn is_app_url(url: &tauri::Url) -> bool {
	let host = url.host_str();
	match url.scheme() {
		"tauri" => host == Some("localhost"),
		"http" | "https" => {
			host == Some("tauri.localhost")
				|| (cfg!(debug_assertions)
					&& matches!(host, Some("localhost") | Some("127.0.0.1")))
		}
		_ => false,
	}
}

// macOS reports a WebKit build number that doesn't track Safari versions
#[cfg(desktop)]
fn outdated_webview_notice() -> Option<String> {
	#[cfg(target_os = "windows")]
	{
		let version = tauri::webview_version().ok()?;
		if version.split('.').next()?.parse::<u32>().ok()? < MIN_CHROMIUM_MAJOR
		{
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

// Tauri exits only once every window is gone, and sign-in opens a second one.
#[cfg(desktop)]
fn quit_when_closed(window: &tauri::WebviewWindow) {
	if window.label() != MAIN_WINDOW_LABEL {
		return;
	}
	let app = window.app_handle().clone();
	window.on_window_event(move |event| {
		if matches!(event, tauri::WindowEvent::Destroyed) {
			app.exit(0);
		}
	});
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	#[cfg(debug_assertions)]
	let devtools = tauri_plugin_devtools::init();

	let builder = tauri::Builder::default();

	// Plugins run in registration order and this one must be first:
	// https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/single-instance
	#[cfg(desktop)]
	let builder = builder.plugin(tauri_plugin_single_instance::init(
		|app, _args, _cwd| {
			if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
				let _ = window.unminimize();
				let _ = window.show();
				let _ = window.set_focus();
			}
		},
	));

	#[cfg(debug_assertions)]
	let builder = builder.plugin(devtools);

	#[cfg(target_os = "android")]
	let builder = builder
		.plugin(tauri_plugin_android_fs::init())
		.plugin(photo::plugin());

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
        .manage(media::MediaProxy::default())
        .manage(api::session_recovery::SessionRecovery::default())
        .register_asynchronous_uri_scheme_protocol(media::SCHEME, media::handle)
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
            api::session_recovery::set_app_active,
            api::session_recovery::session_health,
            scroll_phase::scroll_gesture_capture,
        ])
        .setup(|app| {
            scroll_phase::install_scroll_gesture_bridge(app.handle());
            let user_agent = format!(
                "open-grind/{} (+https://opengrind.org/; contact: admin@opengrind.org)",
                app.package_info().version
            );
            let deferred: Vec<_> = app
                .config()
                .app
                .windows
                .iter()
                .filter(|window| !window.create)
                .cloned()
                .collect();
            for window in deferred {
                let window =
                    tauri::WebviewWindowBuilder::from_config(app.handle(), &window)?
                        .user_agent(&user_agent)
                        .on_navigation(is_app_url)
                        .build()?;
                appearance::unlock_visual_effects(&window);
                #[cfg(desktop)]
                quit_when_closed(&window);
            }

            #[cfg(desktop)]
            if let Some(message) = outdated_webview_notice() {
                use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                app.dialog()
                    .message(message)
                    .title("WebView may be too old")
                    .kind(MessageDialogKind::Warning)
                    .show(|_| {});
            }

            #[cfg(any(
                target_os = "linux",
                all(target_os = "macos", not(feature = "keychain"))
            ))]
            storage::init_file_store(app.path().app_data_dir()?);

            storage::init_keyring();

            let device = DeviceStorage::load_or_create();

            let session = match AuthStorage::get_session() {
                Ok(s) => s,
                Err(e) => {
                    tracing::warn!("[setup] could not load session: {e}");
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
                                    tracing::error!("[session] persist failed: {e}");
                                }
                            }
                            None => AuthStorage::delete_session(),
                        }
                    }
                });
            }

            {
                let client = client.clone();
                let mut key_rx = client.signing_key_receiver();
                tauri::async_runtime::spawn(async move {
                    SigningKeyStorage::restore(&client).await;
                    while key_rx.changed().await.is_ok() {
                        match key_rx.borrow().clone() {
                            Some(k) => {
                                if let Err(e) = SigningKeyStorage::save(&k) {
                                    tracing::error!("[signing] persist failed: {e}");
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

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn release_builds_discard_every_tracing_event() {
		let expected = if cfg!(debug_assertions) {
			tracing::level_filters::LevelFilter::TRACE
		} else {
			tracing::level_filters::LevelFilter::OFF
		};
		assert_eq!(tracing::level_filters::STATIC_MAX_LEVEL, expected);
	}

	fn allows(url: &str) -> bool {
		is_app_url(&tauri::Url::parse(url).unwrap())
	}

	#[test]
	fn admits_the_bundled_asset_origins() {
		assert!(allows("tauri://localhost/"));
		assert!(allows("tauri://localhost/chat/1"));
		assert!(allows("http://tauri.localhost/"));
		assert!(allows("https://tauri.localhost/"));
	}

	#[test]
	fn refuses_navigation_away_from_the_app() {
		for url in [
			"https://example.org/",
			"tauri://example.org/",
			"http://tauri.localhost.example.org/",
			"file:///etc/passwd",
			"javascript:alert(1)",
			"data:text/html,<script>1</script>",
			"ogmedia://localhost/aHR0cHM6Ly9leGFtcGxlLm9yZw",
			"http://ogmedia.localhost/aHR0cHM6Ly9leGFtcGxlLm9yZw",
		] {
			assert!(!allows(url), "{url} must not load in the main webview");
		}
	}
}
