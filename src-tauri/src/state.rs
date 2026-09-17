use std::sync::OnceLock;

use tokio::sync::Mutex;

use crate::error::AppError;

#[derive(Default)]
pub struct AppState {
	pub client: OnceLock<grindr::GrindrClient>,
	pub upload: Mutex<()>,
}

impl AppState {
	pub fn client(&self) -> Result<&grindr::GrindrClient, AppError> {
		self.client.get().ok_or(AppError::NotInitialized)
	}
}
