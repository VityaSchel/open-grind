#[cfg(all(target_os = "macos", not(feature = "keychain")))]
mod file_store {
    use keyring_core::api::{CredentialApi, CredentialPersistence, CredentialStoreApi};
    use keyring_core::{Credential, CredentialStore, Entry, Error, Result};
    use std::any::Any;
    use std::collections::HashMap;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::Arc;

    fn credential_path(base: &std::path::Path, _service: &str, user: &str) -> PathBuf {
        let safe = |s: &str| s.replace(['/', '\\', '\0', ':'], "_");
        base.join("credentials").join(safe(user))
    }

    #[derive(Debug, Clone)]
    pub struct FileCredential {
        service: String,
        user: String,
        base: PathBuf,
    }

    impl CredentialApi for FileCredential {
        fn set_secret(&self, secret: &[u8]) -> Result<()> {
            use std::os::unix::fs::PermissionsExt;
            let path = credential_path(&self.base, &self.service, &self.user);
            let dir = path.parent().ok_or_else(|| {
                Error::PlatformFailure(Box::new(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "credential path has no parent directory",
                )))
            })?;
            fs::create_dir_all(dir).map_err(|e| Error::PlatformFailure(Box::new(e)))?;
            fs::set_permissions(dir, fs::Permissions::from_mode(0o700))
                .map_err(|e| Error::PlatformFailure(Box::new(e)))?;
            fs::write(&path, secret).map_err(|e| Error::PlatformFailure(Box::new(e)))?;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
                .map_err(|e| Error::PlatformFailure(Box::new(e)))
        }

        fn get_secret(&self) -> Result<Vec<u8>> {
            let path = credential_path(&self.base, &self.service, &self.user);
            match fs::read(&path) {
                Ok(bytes) => Ok(bytes),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(Error::NoEntry),
                Err(e) => Err(Error::PlatformFailure(Box::new(e))),
            }
        }

        fn delete_credential(&self) -> Result<()> {
            let path = credential_path(&self.base, &self.service, &self.user);
            match fs::remove_file(&path) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(Error::NoEntry),
                Err(e) => Err(Error::PlatformFailure(Box::new(e))),
            }
        }

        fn get_credential(&self) -> Result<Option<Arc<Credential>>> {
            Ok(None)
        }

        fn get_specifiers(&self) -> Option<(String, String)> {
            Some((self.service.clone(), self.user.clone()))
        }

        fn as_any(&self) -> &dyn Any {
            self
        }
    }

    #[derive(Debug)]
    pub struct FileStore {
        base: PathBuf,
    }

    impl CredentialStoreApi for FileStore {
        fn vendor(&self) -> String {
            "open-grind file store".to_string()
        }

        fn id(&self) -> String {
            "file-store-v1".to_string()
        }

        fn build(
            &self,
            service: &str,
            user: &str,
            _modifiers: Option<&HashMap<&str, &str>>,
        ) -> Result<Entry> {
            let cred = Arc::new(FileCredential {
                service: service.to_string(),
                user: user.to_string(),
                base: self.base.clone(),
            }) as Arc<Credential>;
            Ok(Entry::new_with_credential(cred))
        }

        fn persistence(&self) -> CredentialPersistence {
            CredentialPersistence::UntilDelete
        }

        fn as_any(&self) -> &dyn Any {
            self
        }
    }

    pub fn init(base: PathBuf) {
        use std::os::unix::fs::PermissionsExt;
        let creds_dir = base.join("credentials");
        if let Ok(()) = fs::create_dir_all(&creds_dir) {
            let _ = fs::set_permissions(&creds_dir, fs::Permissions::from_mode(0o700));
        }
        let store = Arc::new(FileStore { base }) as Arc<CredentialStore>;
        keyring_core::set_default_store(store);
    }
}

#[cfg(all(target_os = "macos", not(feature = "keychain")))]
pub fn init_file_store(base: std::path::PathBuf) {
    file_store::init(base);
}

pub fn init_keyring() {
    #[cfg(target_os = "ios")]
    {
        let store = apple_native_keyring_store::protected::Store::new()
            .expect("failed to init iOS keyring");
        keyring_core::set_default_store(store);
    }

    #[cfg(target_os = "android")]
    {
        let store =
            android_native_keyring_store::Store::new().expect("failed to init Android keyring");
        keyring_core::set_default_store(store);
    }

    #[cfg(all(target_os = "macos", feature = "keychain"))]
    {
        let store = apple_native_keyring_store::keychain::Store::new()
            .expect("failed to init macOS keyring");
        keyring_core::set_default_store(store);
    }

    #[cfg(target_os = "windows")]
    {
        let store =
            windows_native_keyring_store::Store::new().expect("failed to init Windows keyring");
        keyring_core::set_default_store(store);
    }

    #[cfg(target_os = "linux")]
    {
        let store =
            linux_keyutils_keyring_store::Store::new().expect("failed to init Linux keyring");
        keyring_core::set_default_store(store);
    }
}

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
        let bytes = rmp_serde::encode::to_vec(device)
            .map_err(|e| AppError::Auth(format!("device encode failed: {e}")))?;
        Self::entry()?
            .set_secret(&bytes)
            .map_err(|e| AppError::Auth(e.to_string()))
    }
}

pub struct AuthStorage;

impl AuthStorage {
    fn entry() -> Result<keyring_core::Entry, AppError> {
        keyring_core::Entry::new("open-grind", "session")
            .map_err(|e| AppError::Auth(e.to_string()))
    }

    pub fn get_session() -> Result<Option<grindr::Session>, AppError> {
        let entry = Self::entry()?;
        let bytes = match entry.get_secret() {
            Ok(b) => b,
            Err(keyring_core::Error::NoEntry) => return Ok(None),
            Err(e) => return Err(AppError::Auth(e.to_string())),
        };
        match rmp_serde::from_slice::<grindr::Session>(&bytes) {
            Ok(s) => Ok(Some(s)),
            Err(_) => {
                Self::delete_session();
                Ok(None)
            }
        }
    }

    pub fn set_session(session: &grindr::Session) -> Result<(), AppError> {
        let bytes = rmp_serde::encode::to_vec(session)
            .map_err(|e| AppError::Auth(format!("session encode failed: {e}")))?;
        Self::entry()?
            .set_secret(&bytes)
            .map_err(|e| AppError::Auth(e.to_string()))
    }

    pub fn delete_session() {
        match Self::entry() {
            Ok(entry) => match entry.delete_credential() {
                Ok(()) | Err(keyring_core::Error::NoEntry) => {}
                Err(e) => eprintln!("[auth] failed to delete keyring session: {e}"),
            },
            Err(e) => eprintln!("[auth] failed to open keyring entry for deletion: {e}"),
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
        let bytes = rmp_serde::encode::to_vec(key)
            .map_err(|e| AppError::Auth(format!("signing key encode failed: {e}")))?;
        Self::entry()?
            .set_secret(&bytes)
            .map_err(|e| AppError::Auth(e.to_string()))
    }

    pub fn delete() {
        if let Ok(entry) = Self::entry() {
            match entry.delete_credential() {
                Ok(()) | Err(keyring_core::Error::NoEntry) => {}
                Err(e) => eprintln!("[signing] failed to delete keyring key: {e}"),
            }
        }
    }
}
