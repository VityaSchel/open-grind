#[cfg(target_os = "android")]
mod android;

use tauri::{AppHandle, Runtime};

use crate::error::AppError;

use super::source::Source;

pub const UNSUPPORTED: &str =
	"HEIC photos aren't supported on this platform yet";

#[cfg(target_os = "android")]
pub use android::plugin;

pub async fn decode<R: Runtime>(
	app: &AppHandle<R>,
	bytes: Vec<u8>,
) -> Result<Source, AppError> {
	#[cfg(target_os = "android")]
	{
		android::decode(app, bytes).await
	}
	#[cfg(not(target_os = "android"))]
	{
		let _ = (app, bytes);
		Err(AppError::Media(UNSUPPORTED.to_owned()))
	}
}
