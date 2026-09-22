pub(crate) mod bytes;
pub(crate) mod file;
mod form;
pub(crate) mod inspect;
mod picked;
mod stream;
#[cfg(test)]
mod test_support;

use crate::error::AppError;

#[derive(Default)]
pub struct UploadLock(tokio::sync::Mutex<()>);

fn media_error(error: std::io::Error) -> AppError {
	AppError::Media(error.to_string())
}
