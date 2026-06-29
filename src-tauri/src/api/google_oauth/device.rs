use keyring_core::Entry;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct GoogleDevice {
    pub android_id: String,
    #[serde(default)]
    pub master_token: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
}

impl GoogleDevice {
    fn entry() -> Result<Entry, AppError> {
        Entry::new("open-grind", "google-device").map_err(|e| AppError::Auth(e.to_string()))
    }

    pub fn load_or_create() -> Result<Self, AppError> {
        if let Some(existing) = Self::load()? {
            return Ok(existing);
        }
        let device = Self {
            android_id: format!("{:016x}", rand::random::<u64>()),
            master_token: None,
            email: None,
        };
        device.save()?;
        Ok(device)
    }

    pub fn load() -> Result<Option<Self>, AppError> {
        let entry = Self::entry()?;
        let bytes = match entry.get_secret() {
            Ok(b) => b,
            Err(keyring_core::Error::NoEntry) => return Ok(None),
            Err(e) => return Err(AppError::Auth(e.to_string())),
        };
        rmp_serde::decode::from_slice(&bytes)
            .map_err(|e| AppError::Auth(e.to_string()))
            .map(Some)
    }

    pub fn save(&self) -> Result<(), AppError> {
        let bytes = rmp_serde::encode::to_vec(self).map_err(|e| AppError::Auth(e.to_string()))?;
        Self::entry()?
            .set_secret(&bytes)
            .map_err(|e| AppError::Auth(e.to_string()))
    }

    pub fn clear_master(&mut self) {
        self.master_token = None;
        self.email = None;
        if let Err(e) = self.save() {
            eprintln!("[google_oauth] failed to clear cached master token: {e}");
        }
    }
}
