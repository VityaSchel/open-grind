use serde::Serialize;

use crate::error::AppError;
use crate::media::MediaProxy;
use crate::state::AppState;
use crate::storage::DeviceStorage;

#[derive(Debug, Serialize)]
pub struct RotateResult {
	#[serde(rename = "user-agent")]
	pub user_agent: String,
	#[serde(rename = "l-device-info")]
	pub l_device_info: String,
}

#[tauri::command]
pub async fn rotate_api_params(
	state: tauri::State<'_, AppState>,
	media: tauri::State<'_, MediaProxy>,
) -> Result<RotateResult, AppError> {
	let client = state.client()?;

	let new_device = grindr::DeviceInfo::generate();
	if let Err(e) = DeviceStorage::save(&new_device) {
		tracing::error!("[client] could not persist rotated device info: {e}");
	}

	let old_device = client.rotate_device(new_device).await?;
	media.forget_everything().await;

	Ok(RotateResult {
		user_agent: grindr::build_user_agent(&old_device, "Free"),
		l_device_info: grindr::build_device_info_header(&old_device),
	})
}
