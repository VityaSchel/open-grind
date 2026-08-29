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

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StorageBackend {
	Keyring,
	File,
	Unavailable,
}

const HAS_FILE_STORE: bool = cfg!(any(
	target_os = "linux",
	all(target_os = "macos", not(feature = "keychain"))
));

pub fn init_keyring() -> StorageBackend {
	let backend = match install_platform_store() {
		Ok(()) => StorageBackend::Keyring,
		Err(e) if HAS_FILE_STORE => {
			tracing::warn!(
				"[storage] no platform keyring, keeping file store: {e}"
			);
			StorageBackend::File
		}
		Err(e) => {
			tracing::error!("[storage] no platform keyring: {e}");
			StorageBackend::Unavailable
		}
	};
	if backend != StorageBackend::Unavailable && !round_trips() {
		tracing::error!("[storage] the credential store failed a round trip");
		return StorageBackend::Unavailable;
	}
	backend
}

#[cfg(target_os = "ios")]
fn install_platform_store() -> Result<(), String> {
	let store = apple_native_keyring_store::protected::Store::new()
		.map_err(|e| e.to_string())?;
	keyring_core::set_default_store(store);
	Ok(())
}

#[cfg(target_os = "android")]
fn install_platform_store() -> Result<(), String> {
	let store = android_native_keyring_store::Store::new()
		.map_err(|e| e.to_string())?;
	keyring_core::set_default_store(store);
	Ok(())
}

#[cfg(all(target_os = "macos", feature = "keychain"))]
fn install_platform_store() -> Result<(), String> {
	let store = apple_native_keyring_store::keychain::Store::new()
		.map_err(|e| e.to_string())?;
	keyring_core::set_default_store(store);
	Ok(())
}

#[cfg(all(target_os = "macos", not(feature = "keychain")))]
fn install_platform_store() -> Result<(), String> {
	Err("built without the keychain feature".to_owned())
}

#[cfg(target_os = "windows")]
fn install_platform_store() -> Result<(), String> {
	let store = windows_native_keyring_store::Store::new()
		.map_err(|e| e.to_string())?;
	keyring_core::set_default_store(store);
	Ok(())
}

#[cfg(target_os = "linux")]
fn install_platform_store() -> Result<(), String> {
	let store = dbus_secret_service_keyring_store::Store::new()
		.map_err(|e| e.to_string())?;
	keyring_core::set_default_store(store);
	Ok(())
}

#[tauri::command]
pub fn storage_backend(
	backend: tauri::State<'_, StorageBackend>,
) -> StorageBackend {
	*backend
}

fn round_trips() -> bool {
	let Ok(entry) = keyring_core::Entry::new("open-grind", "startup-probe")
	else {
		return false;
	};
	let ok = entry.set_secret(b"ok").is_ok()
		&& entry.get_secret().is_ok_and(|secret| secret == b"ok");
	let _ = entry.delete_credential();
	ok
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

	const PERSISTED_ENTRIES: [&str; 3] =
		["device-info", "device-signing-key", "session"];

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

	fn credentials(auth_token: &str) -> grindr::Credentials {
		grindr::Credentials {
			email: "user@example.com".to_owned(),
			profile_id: Some("42".to_owned()),
			auth_token: auth_token.to_owned(),
			kind: grindr::SessionKind::Email,
			third_party_user_id: None,
		}
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
			AuthStorage::set_credentials(&credentials("auth-token")).unwrap();
			SigningKeyStorage::save(&signing_key()).unwrap();

			let mut written: Vec<_> =
				std::fs::read_dir(base.join("credentials"))
					.unwrap()
					.map(|e| {
						e.unwrap().file_name().to_string_lossy().into_owned()
					})
					.collect();
			written.sort();
			assert_eq!(written, PERSISTED_ENTRIES);
		});
	}

	#[test]
	fn the_windows_uninstaller_clears_every_keyring_entry() {
		let hooks = include_str!("../../installer-hooks.nsh");
		for name in PERSISTED_ENTRIES {
			assert!(
				hooks.contains(&format!("\"{name}.open-grind\"")),
				"installer-hooks.nsh leaves {name} in Credential Manager"
			);
		}
	}

	#[test]
	fn init_keyring_leaves_a_usable_store_behind() {
		with_file_store(|_| {
			let backend = init_keyring();

			assert_ne!(backend, StorageBackend::Unavailable);
			assert!(keyring_core::get_default_store().is_some());
			assert!(keyring_core::Entry::new("open-grind", "session").is_ok());
		});
	}

	#[test]
	fn the_probe_leaves_nothing_behind() {
		with_file_store(|_| {
			assert!(round_trips());
			assert!(matches!(
				entry("startup-probe").get_secret(),
				Err(keyring_core::Error::NoEntry)
			));
		});
	}

	#[test]
	fn a_store_that_cannot_round_trip_reads_as_unavailable() {
		let _guard = lock();
		keyring_core::unset_default_store();

		assert!(!round_trips());
	}

	#[test]
	fn nothing_is_stored_before_anything_is_saved() {
		with_file_store(|_| {
			assert!(DeviceStorage::load().unwrap().is_none());
			assert!(AuthStorage::get_credentials().unwrap().is_none());
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
			AuthStorage::set_credentials(&credentials("tok-1")).unwrap();
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
	fn credentials_survive_a_save_and_load() {
		with_file_store(|_| {
			let saved = credentials("auth-token");

			AuthStorage::set_credentials(&saved).unwrap();

			assert_eq!(AuthStorage::get_credentials().unwrap().unwrap(), saved);
		});
	}

	#[test]
	fn credentials_that_cannot_be_decoded_are_discarded_rather_than_kept() {
		with_file_store(|_| {
			entry("session").set_secret(b"not msgpack").unwrap();

			assert!(AuthStorage::get_credentials().unwrap().is_none());
			assert!(matches!(
				entry("session").get_secret(),
				Err(keyring_core::Error::NoEntry)
			));
		});
	}

	#[test]
	fn a_login_stored_before_credentials_existed_still_loads() {
		with_file_store(|_| {
			let legacy = serde_json::json!({
				"email": "user@example.com",
				"expires_at": 9_999_999_999u64,
				"profile_id": "42",
				"session_id": "e".repeat(3056),
				"auth_token": "auth-token",
				"kind": "Google",
				"third_party_user_id": "tp-1",
				"restriction": {
					"AgeVerification": {
						"region": "GB",
						"reason": "age_verification_required",
					},
				},
			});
			entry("session")
				.set_secret(&rmp_serde::encode::to_vec_named(&legacy).unwrap())
				.unwrap();

			let loaded = AuthStorage::get_credentials().unwrap().unwrap();
			assert_eq!(loaded.email, "user@example.com");
			assert_eq!(loaded.profile_id.as_deref(), Some("42"));
			assert_eq!(loaded.auth_token, "auth-token");
			assert_eq!(loaded.kind, grindr::SessionKind::Google);
			assert_eq!(loaded.third_party_user_id.as_deref(), Some("tp-1"));
		});
	}

	#[test]
	fn stored_credentials_stay_far_under_the_windows_blob_cap() {
		const CRED_MAX_CREDENTIAL_BLOB_SIZE: usize = 2560;

		let worst_case = grindr::Credentials {
			email: "a-fairly-long-address@example.com".to_owned(),
			profile_id: Some("1234567890123".to_owned()),
			auth_token: "t".repeat(512),
			kind: grindr::SessionKind::Google,
			third_party_user_id: Some("x".repeat(128)),
		};

		let encoded = rmp_serde::encode::to_vec_named(&worst_case).unwrap();
		assert!(
			encoded.len() < CRED_MAX_CREDENTIAL_BLOB_SIZE,
			"credentials encode to {} bytes",
			encoded.len()
		);
	}

	#[test]
	fn setting_credentials_replaces_the_previous_ones() {
		with_file_store(|_| {
			AuthStorage::set_credentials(&credentials("first")).unwrap();
			AuthStorage::set_credentials(&credentials("second")).unwrap();

			assert_eq!(
				AuthStorage::get_credentials().unwrap().unwrap().auth_token,
				"second"
			);
		});
	}

	#[test]
	fn deleting_the_session_clears_it() {
		with_file_store(|_| {
			AuthStorage::set_credentials(&credentials("auth-token")).unwrap();

			AuthStorage::delete_credentials();

			assert!(AuthStorage::get_credentials().unwrap().is_none());
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
				Some(grindr::Session {
					credentials: credentials("auth-token"),
					token: None,
				}),
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
		assert!(AuthStorage::get_credentials().is_err());
		assert!(SigningKeyStorage::load().is_err());
		assert!(
			AuthStorage::set_credentials(&credentials("auth-token")).is_err()
		);
		DeviceStorage::delete();
		AuthStorage::delete_credentials();
		SigningKeyStorage::delete();
	}
}
