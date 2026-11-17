use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::error::AppError;

const APP_SETTINGS_URL: &str = "app-settings:";

#[tauri::command]
pub async fn open_app_settings(app: AppHandle) -> Result<(), AppError> {
	app.opener()
		.open_url(APP_SETTINGS_URL, None::<&str>)
		.map_err(|error| {
			AppError::Http(format!("Could not open app settings: {error}"))
		})
}
