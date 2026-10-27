use tauri::{AppHandle, Runtime};

use super::TransferPurpose;

pub(super) fn begin_transfer<R: Runtime>(
	_app: &AppHandle<R>,
	_purpose: TransferPurpose,
) {
}

pub(super) fn end_transfer<R: Runtime>(
	_app: &AppHandle<R>,
	_purpose: TransferPurpose,
) {
}
