use crate::error::AppError;

pub struct DeviceStorage;

impl DeviceStorage {
	fn entry() -> Result<keyring_core::Entry, AppError> {
		keyring_core::Entry::new("open-grind", "device-info")
			.map_err(|e| AppError::Auth(e.to_string()))
	}

	pub fn load() -> Result<Option<grindr::DeviceInfo>, AppError> {
		let entry = Self::entry()?;
		let bytes = match entry.get_secret() {
			Ok(b) => b,
			Err(keyring_core::Error::NoEntry) => return Ok(None),
			Err(e) => return Err(AppError::Auth(e.to_string())),
		};
		rmp_serde::from_slice::<grindr::DeviceInfo>(&bytes)
			.map(Some)
			.map_err(|e| AppError::Auth(format!("device decode failed: {e}")))
	}

	pub fn save(device: &grindr::DeviceInfo) -> Result<(), AppError> {
		let bytes = rmp_serde::encode::to_vec_named(device).map_err(|e| {
			AppError::Auth(format!("device encode failed: {e}"))
		})?;
		Self::entry()?
			.set_secret(&bytes)
			.map_err(|e| AppError::Auth(e.to_string()))
	}

	pub fn load_or_create() -> grindr::DeviceInfo {
		match Self::load() {
			Ok(Some(device)) => return device,
			Ok(None) => {}
			Err(e) => tracing::warn!(
				"[setup] could not load device info, replacing it: {e}"
			),
		}
		let device = grindr::DeviceInfo::generate();
		if let Err(e) = Self::save(&device) {
			tracing::error!("[setup] could not persist device info: {e}");
		}
		device
	}

	pub fn delete() {
		match Self::entry() {
			Ok(entry) => match entry.delete_credential() {
				Ok(()) | Err(keyring_core::Error::NoEntry) => {}
				Err(e) => tracing::warn!(
					"[auth] failed to delete keyring device info: {e}"
				),
			},
			Err(e) => tracing::warn!(
				"[auth] failed to open keyring entry for device deletion: {e}"
			),
		}
	}
}

pub struct AuthStorage;

impl AuthStorage {
	fn entry() -> Result<keyring_core::Entry, AppError> {
		keyring_core::Entry::new("open-grind", "session")
			.map_err(|e| AppError::Auth(e.to_string()))
	}

	pub fn get_credentials() -> Result<Option<grindr::Credentials>, AppError> {
		let entry = Self::entry()?;
		let bytes = match entry.get_secret() {
			Ok(b) => b,
			Err(keyring_core::Error::NoEntry) => return Ok(None),
			Err(e) => return Err(AppError::Auth(e.to_string())),
		};
		match rmp_serde::from_slice::<grindr::Credentials>(&bytes) {
			Ok(c) => Ok(Some(c)),
			Err(_) => {
				Self::delete_credentials();
				Ok(None)
			}
		}
	}

	pub fn set_credentials(
		credentials: &grindr::Credentials,
	) -> Result<(), AppError> {
		let bytes =
			rmp_serde::encode::to_vec_named(credentials).map_err(|e| {
				AppError::Auth(format!("credentials encode failed: {e}"))
			})?;
		Self::entry()?
			.set_secret(&bytes)
			.map_err(|e| AppError::Auth(e.to_string()))
	}

	pub fn delete_credentials() {
		match Self::entry() {
			Ok(entry) => match entry.delete_credential() {
				Ok(()) | Err(keyring_core::Error::NoEntry) => {}
				Err(e) => tracing::warn!(
					"[auth] failed to delete keyring session: {e}"
				),
			},
			Err(e) => tracing::warn!(
				"[auth] failed to open keyring entry for deletion: {e}"
			),
		}
	}
}

pub struct SigningKeyStorage;

impl SigningKeyStorage {
	fn entry() -> Result<keyring_core::Entry, AppError> {
		keyring_core::Entry::new("open-grind", "device-signing-key")
			.map_err(|e| AppError::Auth(e.to_string()))
	}

	pub fn load() -> Result<Option<grindr::DeviceSigningKey>, AppError> {
		let bytes = match Self::entry()?.get_secret() {
			Ok(b) => b,
			Err(keyring_core::Error::NoEntry) => return Ok(None),
			Err(e) => return Err(AppError::Auth(e.to_string())),
		};
		Ok(rmp_serde::from_slice::<grindr::DeviceSigningKey>(&bytes).ok())
	}

	pub fn save(key: &grindr::DeviceSigningKey) -> Result<(), AppError> {
		let bytes = rmp_serde::encode::to_vec_named(key).map_err(|e| {
			AppError::Auth(format!("signing key encode failed: {e}"))
		})?;
		Self::entry()?
			.set_secret(&bytes)
			.map_err(|e| AppError::Auth(e.to_string()))
	}

	pub fn delete() {
		if let Ok(entry) = Self::entry() {
			match entry.delete_credential() {
				Ok(()) | Err(keyring_core::Error::NoEntry) => {}
				Err(e) => tracing::warn!(
					"[signing] failed to delete keyring key: {e}"
				),
			}
		}
	}

	pub async fn restore(client: &grindr::GrindrClient) {
		let Some(key) = Self::load().unwrap_or(None) else {
			return;
		};
		if client.restore_signing_key(key).await {
			return;
		}
		tracing::warn!("[signing] stored key was refused, deleting it");
		Self::delete();
	}
}
