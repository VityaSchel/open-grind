use std::sync::OnceLock;

use crate::error::AppError;

pub struct AppState {
	pub client: OnceLock<grindr::GrindrClient>,
}

impl AppState {
	pub fn client(&self) -> Result<&grindr::GrindrClient, AppError> {
		self.client.get().ok_or(AppError::NotInitialized)
	}
}
