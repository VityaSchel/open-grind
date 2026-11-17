#[cfg(target_os = "android")]
mod android;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod apple;

use tauri::{AppHandle, Runtime};

use crate::error::AppError;
#[cfg(any(target_os = "linux", target_os = "windows"))]
use crate::error::MediaError;

use super::source::Source;

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
		Err(MediaError::HeicUnsupported.into())
	}
}
