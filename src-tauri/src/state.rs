use std::sync::OnceLock;

use crate::error::AppError;

static SHARED: OnceLock<grindr::GrindrClient> = OnceLock::new();

pub struct AppState {
	pub client: OnceLock<grindr::GrindrClient>,
}

impl AppState {
	pub fn client(&self) -> Result<&grindr::GrindrClient, AppError> {
		self.client.get().ok_or(AppError::NotInitialized)
	}
}

#[cfg(target_os = "android")]
pub fn shared() -> Option<grindr::GrindrClient> {
	SHARED.get().cloned()
}

pub fn share(
	build: impl FnOnce() -> grindr::GrindrClient,
) -> grindr::GrindrClient {
	SHARED.get_or_init(build).clone()
}
