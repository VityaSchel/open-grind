#[cfg(target_os = "android")]
mod android;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod apple;

use tauri::{AppHandle, Runtime};

use crate::error::AppError;

use super::source::Source;

#[cfg(any(target_os = "android", target_os = "linux", target_os = "windows"))]
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
	#[cfg(any(target_os = "ios", target_os = "macos"))]
	{
		let _ = app;
		apple::decode(bytes).await
	}
	#[cfg(any(target_os = "linux", target_os = "windows"))]
	{
		let _ = (app, bytes);
		Err(AppError::Media(UNSUPPORTED.to_owned()))
	}
}
