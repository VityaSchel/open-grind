#[cfg(target_os = "android")]
mod android;

use tauri::{AppHandle, Runtime};

use crate::error::AppError;
#[cfg(not(target_os = "android"))]
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
	#[cfg(not(target_os = "android"))]
	{
		let _ = (app, bytes);
		Err(MediaError::HeicUnsupported.into())
	}
}
