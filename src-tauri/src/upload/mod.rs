pub(crate) mod bytes;
pub(crate) mod file;
mod form;
pub(crate) mod inspect;
pub(crate) mod linked;
mod picked;
pub(crate) mod preview;
pub(crate) mod staged;
mod stream;
#[cfg(test)]
mod test_support;

use crate::error::{AppError, MediaError};

#[derive(Default)]
pub struct UploadLock(tokio::sync::Mutex<()>);

fn media_error(error: std::io::Error) -> AppError {
	let reason = error
		.get_ref()
		.and_then(|inner| inner.downcast_ref::<MediaError>())
		.cloned()
		.unwrap_or_else(|| MediaError::Io {
			detail: error.to_string(),
		});
	AppError::Media(reason)
}
