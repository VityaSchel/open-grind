mod body;
mod queue;
mod resume;
mod retained;
mod run;
mod stage;
#[cfg(test)]
mod testserver;
mod transfer;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::watch;

use super::baseline::InstallKind;
use super::error::UpdateError;
use super::release::Candidate;
pub use queue::Downloads;

pub(super) const PROGRESS_EVENT: &str = "updater:progress";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "phase", content = "detail")]
pub enum Phase {
	Downloading,
	Verifying,
	Ready,
	Canceled,
	Failed(UpdateError),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
	pub component: String,
	pub kind: InstallKind,
	pub tag: String,
	pub version: String,
	#[serde(flatten)]
	pub phase: Phase,
	pub received: u64,
	pub total: u64,
}

impl Progress {
	pub(super) fn new(
		candidate: &Candidate,
		received: u64,
		phase: Phase,
	) -> Self {
		Self {
			component: candidate.component.clone(),
			kind: candidate.kind,
			tag: candidate.tag.clone(),
			version: candidate.version.clone(),
			phase,
			received,
			total: candidate.payload.size,
		}
	}
}

fn emit<R: Runtime>(
	app: &AppHandle<R>,
	progress: &watch::Sender<Progress>,
	next: Progress,
) {
	let _ = app.emit(PROGRESS_EVENT, &next);
	let _ = progress.send(next);
}
