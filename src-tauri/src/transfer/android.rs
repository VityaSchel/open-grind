use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use super::{TransferProgress, TransferPurpose, MEDIA_UPLOAD};
use crate::api::update::{AndroidUpdater, InstallKind};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TransferRequest<'a> {
	package_name: Option<&'a str>,
	kind: Option<InstallKind>,
	purpose: Option<&'a str>,
	percent: Option<u8>,
}

fn transfer_request(
	purpose: TransferPurpose,
	percent: Option<u8>,
) -> TransferRequest<'static> {
	match purpose {
		TransferPurpose::Update { package_name, kind } => TransferRequest {
			package_name: Some(package_name),
			kind: Some(kind),
			purpose: None,
			percent,
		},
		TransferPurpose::MediaUpload => TransferRequest {
			package_name: None,
			kind: None,
			purpose: Some(MEDIA_UPLOAD),
			percent,
		},
	}
}

fn send_transfer<R: Runtime>(
	app: &AppHandle<R>,
	command: &str,
	request: TransferRequest<'_>,
) {
	let Some(state) = app.try_state::<AndroidUpdater>() else {
		return;
	};
	if let Err(e) = state
		.handle
		.run_mobile_plugin::<serde_json::Value>(command, request)
	{
		tracing::warn!("[transfer] {command} failed: {e}");
	}
}

pub(super) fn begin_transfer<R: Runtime>(
	app: &AppHandle<R>,
	purpose: TransferPurpose,
) {
	send_transfer(app, "beginTransfer", transfer_request(purpose, None));
}

pub(super) fn report_transfer<R: Runtime>(
	app: &AppHandle<R>,
	purpose: TransferPurpose,
	progress: TransferProgress,
) {
	let percent = match progress {
		TransferProgress::Percent(percent) => Some(percent),
		TransferProgress::Indeterminate => None,
	};
	send_transfer(app, "transferProgress", transfer_request(purpose, percent));
}

pub(super) fn end_transfer<R: Runtime>(
	app: &AppHandle<R>,
	purpose: TransferPurpose,
) {
	send_transfer(app, "endTransfer", transfer_request(purpose, None));
}
