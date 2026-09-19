use tauri::AppHandle;

use super::{PushCategory, PushError, PushMode, PushSignal};

const UNSUPPORTED: PushError = PushError::UnsupportedPlatform;

pub async fn addon_ready(_app: &AppHandle) -> Result<(), PushError> {
	Err(UNSUPPORTED)
}

pub async fn token(_app: &AppHandle) -> Result<String, PushError> {
	Err(UNSUPPORTED)
}

pub async fn delete_token(_app: &AppHandle) -> Result<(), PushError> {
	Err(UNSUPPORTED)
}

pub async fn mode(_app: &AppHandle) -> Result<PushMode, PushError> {
	Ok(PushMode::Slow)
}

pub async fn set_mode(
	_app: &AppHandle,
	_mode: PushMode,
) -> Result<(), PushError> {
	Err(UNSUPPORTED)
}

pub async fn categories(
	_app: &AppHandle,
) -> Result<Vec<PushCategory>, PushError> {
	Ok(Vec::new())
}

pub async fn set_category(
	_app: &AppHandle,
	_category: String,
	_enabled: bool,
) -> Result<(), PushError> {
	Err(UNSUPPORTED)
}

pub async fn open_category_settings(
	_app: &AppHandle,
	_category: String,
) -> Result<(), PushError> {
	Err(UNSUPPORTED)
}

pub async fn notifications_permitted(
	_app: &AppHandle,
) -> Result<bool, PushError> {
	Ok(false)
}

pub async fn request_notifications(
	_app: &AppHandle,
) -> Result<bool, PushError> {
	Err(UNSUPPORTED)
}

pub async fn take_deeplink(
	_app: &AppHandle,
) -> Result<Option<String>, PushError> {
	Ok(None)
}

pub fn watch(
	_app: &AppHandle,
	_on_event: tauri::ipc::Channel<PushSignal>,
) -> Result<(), PushError> {
	Err(UNSUPPORTED)
}
