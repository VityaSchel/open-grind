use tauri::window::{ProgressBarState, ProgressBarStatus};
use tauri::{AppHandle, Manager, Runtime};

use super::super::TransferProgress;

pub(super) fn show<R: Runtime>(app: &AppHandle<R>, progress: TransferProgress) {
	match progress {
		TransferProgress::Percent(percent) => {
			set(app, ProgressBarStatus::Normal, Some(u64::from(percent)));
		}
		TransferProgress::Indeterminate => {
			set(app, ProgressBarStatus::Indeterminate, None);
		}
	}
}

pub(super) fn clear<R: Runtime>(app: &AppHandle<R>) {
	set(app, ProgressBarStatus::None, None);
}

fn set<R: Runtime>(
	app: &AppHandle<R>,
	status: ProgressBarStatus,
	progress: Option<u64>,
) {
	let Some(window) = app.get_webview_window(crate::MAIN_WINDOW_LABEL) else {
		return;
	};
	let state = ProgressBarState {
		status: Some(status),
		progress,
	};
	if let Err(e) = window.set_progress_bar(state) {
		tracing::warn!("[transfer] taskbar progress failed: {e}");
	}
}
