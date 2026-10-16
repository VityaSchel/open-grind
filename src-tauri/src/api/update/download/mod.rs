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
use super::install::{TransferHold, TransferProgress};
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

	fn transfer_progress(&self) -> Option<TransferProgress> {
		match self.phase {
			Phase::Downloading if self.total > 0 => {
				let percent = self.received.min(self.total) * 100 / self.total;
				Some(TransferProgress::Percent(
					u8::try_from(percent).unwrap_or(100),
				))
			}
			Phase::Downloading | Phase::Verifying => {
				Some(TransferProgress::Indeterminate)
			}
			Phase::Ready | Phase::Canceled | Phase::Failed(_) => None,
		}
	}
}

pub(super) struct ProgressFeed<'a, R: Runtime> {
	app: &'a AppHandle<R>,
	sender: &'a watch::Sender<Progress>,
	hold: TransferHold<'a, R>,
}

impl<'a, R: Runtime> ProgressFeed<'a, R> {
	pub(super) fn begin(
		app: &'a AppHandle<R>,
		sender: &'a watch::Sender<Progress>,
		candidate: &Candidate,
	) -> Self {
		Self {
			app,
			sender,
			hold: TransferHold::update(app, candidate),
		}
	}

	pub(super) fn emit(&mut self, next: Progress) {
		let _ = self.app.emit(PROGRESS_EVENT, &next);
		let shown = next.transfer_progress();
		let _ = self.sender.send(next);
		if let Some(progress) = shown {
			self.hold.report(progress);
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn progress(phase: Phase, received: u64, total: u64) -> Progress {
		Progress {
			component: "app".into(),
			kind: InstallKind::Update,
			tag: "v1".into(),
			version: "0.2.0".into(),
			phase,
			received,
			total,
		}
	}

	#[test]
	fn a_download_shows_the_whole_percent_it_reached() {
		assert_eq!(
			progress(Phase::Downloading, 999, 1000).transfer_progress(),
			Some(TransferProgress::Percent(99))
		);
		assert_eq!(
			progress(Phase::Downloading, 1000, 1000).transfer_progress(),
			Some(TransferProgress::Percent(100))
		);
	}

	#[test]
	fn a_download_of_unknown_size_and_verifying_show_no_percent() {
		assert_eq!(
			progress(Phase::Downloading, 10, 0).transfer_progress(),
			Some(TransferProgress::Indeterminate)
		);
		assert_eq!(
			progress(Phase::Verifying, 1000, 1000).transfer_progress(),
			Some(TransferProgress::Indeterminate)
		);
	}

	#[test]
	fn a_finished_transfer_shows_nothing() {
		for phase in [
			Phase::Ready,
			Phase::Canceled,
			Phase::Failed(UpdateError::Oversize),
		] {
			assert_eq!(progress(phase, 1000, 1000).transfer_progress(), None);
		}
	}
}
