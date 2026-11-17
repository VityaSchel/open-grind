use tauri::{AppHandle, Runtime};

use super::TransferPurpose;
use crate::background_task::Purpose;

pub(super) fn begin_transfer<R: Runtime>(
	app: &AppHandle<R>,
	purpose: TransferPurpose,
) {
	task_purpose(purpose).hold(app);
}

pub(super) fn end_transfer<R: Runtime>(
	app: &AppHandle<R>,
	purpose: TransferPurpose,
) {
	task_purpose(purpose).release(app);
}

const fn task_purpose(purpose: TransferPurpose) -> Purpose {
	match purpose {
		TransferPurpose::MediaUpload => Purpose::MediaUpload,
	}
}
