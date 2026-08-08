mod entries;
#[cfg(any(
	target_os = "linux",
	all(target_os = "macos", not(feature = "keychain"))
))]
mod file_store;

pub use entries::{AuthStorage, DeviceStorage, SigningKeyStorage};

#[cfg(any(
	target_os = "linux",
	all(target_os = "macos", not(feature = "keychain"))
))]
pub fn init_file_store(base: std::path::PathBuf) {
	file_store::init(base);
}

pub fn init_keyring() {
	#[cfg(target_os = "ios")]
	match apple_native_keyring_store::protected::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => tracing::error!("[storage] could not init iOS keyring: {e}"),
	}

	#[cfg(target_os = "android")]
	match android_native_keyring_store::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => {
			tracing::error!("[storage] could not init Android keyring: {e}")
		}
	}

	#[cfg(all(target_os = "macos", feature = "keychain"))]
	match apple_native_keyring_store::keychain::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => {
			tracing::error!("[storage] could not init macOS keyring: {e}")
		}
	}

	#[cfg(target_os = "windows")]
	match windows_native_keyring_store::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => {
			tracing::error!("[storage] could not init Windows keyring: {e}")
		}
	}

	#[cfg(target_os = "linux")]
	match dbus_secret_service_keyring_store::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => tracing::warn!(
			"[storage] no secret service, keeping file store: {e}"
		),
	}
}

#[cfg(all(
	test,
	any(
		target_os = "linux",
		all(target_os = "macos", not(feature = "keychain"))
	)
))]
mod tests {
	use std::path::Path;
	use std::sync::Mutex;

	use super::*;

	static DEFAULT_STORE: Mutex<()> = Mutex::new(());

	fn lock() -> std::sync::MutexGuard<'static, ()> {
		DEFAULT_STORE.lock().unwrap_or_else(|e| e.into_inner())
	}

	fn with_file_store(test: impl FnOnce(&Path)) {
		let _guard = lock();
		let base = file_store::scratch_dir();
		init_file_store(base.clone());
		test(&base);
		std::fs::remove_dir_all(&base).ok();
	}

	fn entry(user: &str) -> keyring_core::Entry {
		keyring_core::Entry::new("open-grind", user).unwrap()
	}

	fn session(session_id: &str) -> grindr::Session {
		serde_json::from_value(serde_json::json!({
			"email": "user@example.com",
			"expires_at": 9_999_999_999u64,
			"profile_id": "42",
			"session_id": session_id,
			"auth_token": "auth-token",
		}))
		.unwrap()
	}

	fn signing_key() -> grindr::DeviceSigningKey {
		serde_json::from_value(serde_json::json!({
			"key": "-----BEGIN PRIVATE KEY-----",
			"user_id": "42",
		}))
		.unwrap()
	}

	#[test]
	fn the_installed_store_backs_every_keyring_entry() {
		with_file_store(|base| {
			DeviceStorage::save(&grindr::DeviceInfo::generate()).unwrap();
			AuthStorage::set_session(&session("session-token")).unwrap();
			SigningKeyStorage::save(&signing_key()).unwrap();

			let mut written: Vec<_> =
				std::fs::read_dir(base.join("credentials"))
					.unwrap()
					.map(|e| {
						e.unwrap().file_name().to_string_lossy().into_owned()
					})
					.collect();
			written.sort();
			assert_eq!(
				written,
				["device-info", "device-signing-key", "session"]
			);
		});
	}

	#[test]
	fn init_keyring_leaves_a_usable_store_behind() {
		with_file_store(|_| {
			init_keyring();

			assert!(keyring_core::get_default_store().is_some());
			assert!(keyring_core::Entry::new("open-grind", "session").is_ok());
		});
	}

	#[test]
	fn nothing_is_stored_before_anything_is_saved() {
		with_file_store(|_| {
			assert!(DeviceStorage::load().unwrap().is_none());
			assert!(AuthStorage::get_session().unwrap().is_none());
			assert!(SigningKeyStorage::load().unwrap().is_none());
		});
	}

	#[test]
	fn a_device_survives_a_save_and_load() {
		with_file_store(|_| {
			let device = grindr::DeviceInfo::generate();

			DeviceStorage::save(&device).unwrap();

			let loaded = DeviceStorage::load().unwrap().unwrap();
			assert_eq!(format!("{loaded:?}"), format!("{device:?}"));
		});
	}

	#[test]
	fn a_device_stored_before_build_id_existed_still_loads() {
		#[derive(serde::Serialize)]
		struct DeviceBeforeBuildId {
			device_type: u8,
			device_id: &'static str,
			os: &'static str,
			screen_resolution: &'static str,
			total_ram: &'static str,
			advertising_id: &'static str,
			device_model: &'static str,
			manufacturer: &'static str,
			timezone: &'static str,
			locale: &'static str,
			accept_language: &'static str,
		}

		with_file_store(|_| {
			let stored = rmp_serde::encode::to_vec(&DeviceBeforeBuildId {
				device_type: 2,
				device_id: "0123456789abcdef",
				os: "Android 14",
				screen_resolution: "2400x1080",
				total_ram: "8026152960",
				advertising_id: "ad-id",
				device_model: "Pixel 8",
				manufacturer: "Google",
				timezone: "Europe/Madrid",
				locale: "en_US",
				accept_language: "en-US",
			})
			.unwrap();
			entry("device-info").set_secret(&stored).unwrap();

			let loaded = DeviceStorage::load().unwrap().unwrap();

			assert_eq!(loaded.device_id, "0123456789abcdef");
			assert_eq!(loaded.device_model, "Pixel 8");
			assert!(loaded.build_id.is_empty());
		});
	}

	#[test]
	fn every_secret_is_stored_as_a_named_map_not_a_positional_array() {
		with_file_store(|_| {
			DeviceStorage::save(&grindr::DeviceInfo::generate()).unwrap();
			AuthStorage::set_session(&session("s1")).unwrap();
			SigningKeyStorage::save(&signing_key()).unwrap();

			for name in ["device-info", "session", "device-signing-key"] {
				let stored = entry(name).get_secret().unwrap();
				let decoded: serde_json::Value =
					rmp_serde::from_slice(&stored).unwrap();

				assert!(
					decoded.is_object(),
					"{name} is a positional array, not a named map"
				);
			}
		});
	}

	#[test]
	fn a_device_that_cannot_be_decoded_is_reported_as_an_error() {
		with_file_store(|_| {
			entry("device-info").set_secret(b"not msgpack").unwrap();

			assert!(DeviceStorage::load().is_err());
		});
	}

	#[test]
	fn a_created_device_is_persisted_for_the_next_launch() {
		with_file_store(|_| {
			let created = DeviceStorage::load_or_create();

			assert_eq!(
				format!("{:?}", DeviceStorage::load_or_create()),
				format!("{created:?}")
			);
		});
	}

	#[test]
	fn a_device_that_cannot_be_decoded_is_replaced_rather_than_regenerated_forever(
	) {
		with_file_store(|_| {
			entry("device-info").set_secret(b"not msgpack").unwrap();

			let replacement = DeviceStorage::load_or_create();

			assert_eq!(
				format!("{:?}", DeviceStorage::load().unwrap().unwrap()),
				format!("{replacement:?}")
			);
		});
	}

	#[test]
	fn deleting_the_device_clears_it() {
		with_file_store(|_| {
			DeviceStorage::save(&grindr::DeviceInfo::generate()).unwrap();

			DeviceStorage::delete();

			assert!(DeviceStorage::load().unwrap().is_none());
		});
	}

	#[test]
	fn a_session_survives_a_save_and_load() {
		with_file_store(|_| {
			let saved = session("session-token");

			AuthStorage::set_session(&saved).unwrap();

			let loaded = AuthStorage::get_session().unwrap().unwrap();
			assert_eq!(loaded.session_id, saved.session_id);
			assert_eq!(loaded.auth_token, saved.auth_token);
			assert_eq!(loaded.email, saved.email);
			assert_eq!(loaded.profile_id, saved.profile_id);
			assert_eq!(loaded.expires_at, saved.expires_at);
		});
	}

	#[test]
	fn a_session_that_cannot_be_decoded_is_discarded_rather_than_kept() {
		with_file_store(|_| {
			entry("session").set_secret(b"not msgpack").unwrap();

			assert!(AuthStorage::get_session().unwrap().is_none());
			assert!(matches!(
				entry("session").get_secret(),
				Err(keyring_core::Error::NoEntry)
			));
		});
	}

	#[test]
	fn setting_a_session_replaces_the_previous_one() {
		with_file_store(|_| {
			AuthStorage::set_session(&session("first")).unwrap();
			AuthStorage::set_session(&session("second")).unwrap();

			assert_eq!(
				AuthStorage::get_session().unwrap().unwrap().session_id,
				"second"
			);
		});
	}

	#[test]
	fn deleting_the_session_clears_it() {
		with_file_store(|_| {
			AuthStorage::set_session(&session("session-token")).unwrap();

			AuthStorage::delete_session();

			assert!(AuthStorage::get_session().unwrap().is_none());
		});
	}

	#[test]
	fn a_signing_key_survives_a_save_and_load() {
		with_file_store(|_| {
			let key = signing_key();

			SigningKeyStorage::save(&key).unwrap();

			let loaded = SigningKeyStorage::load().unwrap().unwrap();
			assert_eq!(format!("{loaded:?}"), format!("{key:?}"));
		});
	}

	#[test]
	fn a_signing_key_that_cannot_be_decoded_reads_as_absent() {
		with_file_store(|_| {
			entry("device-signing-key")
				.set_secret(b"not msgpack")
				.unwrap();

			assert!(SigningKeyStorage::load().unwrap().is_none());
		});
	}

	#[test]
	fn a_signing_key_the_client_refuses_is_dropped_from_storage() {
		with_file_store(|_| {
			SigningKeyStorage::save(&signing_key()).unwrap();
			let client = grindr::GrindrClient::new(
				grindr::DeviceInfo::generate(),
				Some(session("session-token")),
			)
			.unwrap();

			tokio::runtime::Builder::new_current_thread()
				.build()
				.unwrap()
				.block_on(SigningKeyStorage::restore(&client));

			assert!(SigningKeyStorage::load().unwrap().is_none());
		});
	}

	#[test]
	fn deleting_the_signing_key_clears_it() {
		with_file_store(|_| {
			SigningKeyStorage::save(&signing_key()).unwrap();

			SigningKeyStorage::delete();

			assert!(SigningKeyStorage::load().unwrap().is_none());
		});
	}

	#[test]
	fn with_no_store_at_all_the_storages_report_errors_instead_of_panicking() {
		let _guard = lock();
		keyring_core::unset_default_store();

		assert!(DeviceStorage::load().is_err());
		assert!(AuthStorage::get_session().is_err());
		assert!(SigningKeyStorage::load().is_err());
		assert!(AuthStorage::set_session(&session("session-token")).is_err());
		DeviceStorage::delete();
		AuthStorage::delete_session();
		SigningKeyStorage::delete();
	}
}
