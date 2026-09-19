pub mod api;
mod app_settings;
mod appearance;
mod appimage;
mod context_menu;
mod desktop_entry;
mod error;
mod haptics;
mod hex;
pub mod media;
mod photo;
pub mod push_poll;
mod scroll_phase;
pub mod state;
mod storage;
mod upload;
mod video;

use tauri::Manager;

use std::sync::OnceLock;

use crate::state::AppState;
use crate::storage::{AuthStorage, DeviceStorage, SigningKeyStorage};

#[cfg(target_os = "windows")]
const MIN_CHROMIUM_MAJOR: u32 = 111;
#[cfg(target_os = "linux")]
const MIN_WEBKITGTK: (u32, u32) = (2, 42);

#[cfg(desktop)]
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
	api::update::enforce_home();

	#[cfg(feature = "devtools")]
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

	#[cfg(feature = "devtools")]
	let builder = builder.plugin(devtools);

	#[cfg(target_os = "android")]
	let builder = builder
		.plugin(tauri_plugin_android_fs::init())
		.plugin(photo::plugin())
		.plugin(api::recaptcha::plugin())
		.plugin(api::push::plugin());

	builder
        .plugin(open_grind_platform_plugin())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_geolocation::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(api::google_oauth::plugin())
        .plugin(api::facebook_oauth::plugin())
        .plugin(api::update::plugin())
        .plugin(app_settings::plugin())
        .manage(AppState {
            client: OnceLock::new(),
        })
        .manage(upload::UploadLock::default())
        .manage(media::MediaProxy::default())
        .manage(api::session_recovery::SessionRecovery::default())
        .register_asynchronous_uri_scheme_protocol(media::SCHEME, media::handle)
        .invoke_handler(tauri::generate_handler![
            api::auth::sign_in_with_email,
            api::auth::sign_in_with_google,
            api::auth::sign_in_with_google_token,
            api::auth::backend_ready,
            api::auth::google_handoff_pending,
            api::auth::sign_in_with_google_handoff,
            api::auth::discard_google_handoff,
            api::auth::sign_in_with_facebook,
            api::auth::refresh_session,
            api::auth::sign_out,
            api::auth::account_restriction,
            api::auth::recaptcha_first_party_enabled,
            api::recaptcha::mint_recaptcha_token,
            api::push::push_addon_ready,
            api::push::push_token,
            api::push::push_delete_token,
            api::push::push_mode,
            api::push::push_set_mode,
            api::push::push_categories,
            api::push::push_set_category,
            api::push::push_open_category_settings,
            api::push::push_notifications_permitted,
            api::push::push_request_notifications,
            api::push::push_take_deeplink,
            api::push::push_watch,
            storage::storage_backend,
            api::rest::request,
            upload::bytes::upload_media,
            upload::inspect::inspect_media_file,
            upload::file::upload_media_file,
            api::ws::ws_connect,
            api::ws::ws_reconnect,
            api::ws::ws_send,
            api::client::rotate_api_params,
            api::session_recovery::set_app_active,
            api::session_recovery::current_session,
            haptics::play_threshold_haptic,
            scroll_phase::set_scroll_gesture_capture,
            desktop_entry::desktop_entry_state,
            desktop_entry::desktop_entry_install,
            desktop_entry::desktop_entry_remove,
            api::update::commands::updater_capability,
            api::update::commands::updater_settings,
            api::update::commands::updater_set_auto_check,
            api::update::commands::updater_check,
            api::update::commands::updater_download,
            api::update::commands::updater_cancel_download,
            api::update::commands::updater_progress,
            api::update::commands::updater_readiness,
            api::update::commands::updater_install,
            api::update::commands::updater_install_pending,
            api::update::commands::updater_installed_version,
            api::update::commands::updater_take_install_outcome,
            api::update::commands::updater_open_install_permission_settings,
            api::update::commands::updater_discard,
            app_settings::open_app_settings,
            appearance::backdrop_filter_renders,
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
                context_menu::trim_native_menu(&window);
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
            storage::init_file_store(app.path().app_local_data_dir()?);

            app.manage(storage::init_keyring());

            let device = DeviceStorage::load_or_create();

            let credentials = match AuthStorage::get_credentials() {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("[setup] could not load credentials: {e}");
                    None
                }
            };

            let resumed = credentials.clone().map(|credentials| grindr::Session {
                credentials,
                token: None,
            });
            let client = state::share(|| {
                grindr::GrindrClient::new(device, resumed)
                    .expect("failed to build GrindrClient")
            });

            {
                let mut session_rx = client.session_receiver();
                let mut stored = credentials;
                let mut restriction = None;
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    while session_rx.changed().await.is_ok() {
                        let (next, next_restriction) = {
                            let session = session_rx.borrow();
                            (
                                session
                                    .as_ref()
                                    .map(|session| session.credentials.clone()),
                                session.as_ref().and_then(|session| {
                                    session.token.as_ref()?.restriction.clone()
                                }),
                            )
                        };

                        if next_restriction != restriction {
                            if let Some(r) = &next_restriction {
                                use tauri::Emitter;
                                handle
                                    .emit(
                                        "auth:restriction",
                                        api::auth::Restriction::from(r.clone()),
                                    )
                                    .ok();
                            }
                            restriction = next_restriction;
                        }

                        if next == stored {
                            continue;
                        }
                        match &next {
                            Some(c) => {
                                if let Err(e) = AuthStorage::set_credentials(c) {
                                    tracing::error!("[session] persist failed: {e}");
                                }
                            }
                            None => AuthStorage::delete_credentials(),
                        }
                        stored = next;
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

#[cfg(test)]
mod webview_floor_pins {
	const THIS: &str = include_str!("lib.rs");
	const TAURI_CONF: &str = include_str!("../tauri.conf.json");
	const GRADLE: &str = include_str!("../gen/android/app/build.gradle.kts");
	const APP_HTML: &str = include_str!("../../src/app.html");

	fn numbers_after<'a>(
		haystack: &'a str,
		marker: &str,
	) -> impl Iterator<Item = u32> + 'a {
		let at = haystack.find(marker).expect(marker) + marker.len();
		haystack[at..]
			.split(|c: char| !c.is_ascii_digit())
			.filter(|run| !run.is_empty())
			.map(|run| run.parse().unwrap())
	}

	#[test]
	fn every_webview_floor_names_the_same_chromium_major() {
		let rust =
			numbers_after(THIS, "const MIN_CHROMIUM_MAJOR: u32 =").next();
		assert_eq!(
			rust,
			numbers_after(TAURI_CONF, "\"minimumWebview2Version\":").next()
		);
		assert_eq!(
			rust,
			numbers_after(GRADLE, "MIN_SUPPORTED_WEBVIEW_MAJOR\",").next()
		);
	}

	#[test]
	fn the_unsupported_page_names_the_webkitgtk_floor() {
		let rust: Vec<u32> =
			numbers_after(THIS, "const MIN_WEBKITGTK: (u32, u32) =")
				.take(2)
				.collect();
		let page: Vec<u32> =
			numbers_after(APP_HTML, "<code>webkit2gtk</code> (")
				.take(2)
				.collect();
		assert_eq!(rust, page);
	}
}

#[cfg(test)]
mod frontend_method_pins {
	const THIS: &str = include_str!("lib.rs");
	const METHODS: &str = include_str!("../../src/lib/api/methods.ts");

	fn between<'a>(haystack: &'a str, open: &str, close: &str) -> &'a str {
		let start = haystack.find(open).expect(open) + open.len();
		let len = haystack[start..].find(close).expect(close);
		&haystack[start..start + len]
	}

	#[test]
	fn every_frontend_method_is_a_registered_command() {
		let registered: Vec<&str> =
			between(THIS, "tauri::generate_handler![", "])")
				.split(',')
				.filter_map(|entry| entry.trim().rsplit("::").next())
				.collect();
		let methods: Vec<&str> =
			between(METHODS, "export const methods = {", "\n}")
				.lines()
				.filter_map(|line| line.strip_prefix('\t'))
				.filter(|line| !line.starts_with(['\t', '}']))
				.map(|line| line.split_once(':').expect(line).0)
				.collect();
		assert!(!methods.is_empty());
		for method in methods {
			assert!(
				registered.contains(&method),
				"{method} is called by the frontend but not registered"
			);
		}
	}
}
