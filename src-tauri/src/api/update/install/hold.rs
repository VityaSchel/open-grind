use std::time::{Duration, Instant};

use tauri::{AppHandle, Runtime};

use super::super::baseline::InstallKind;
use super::super::component::{self, Component};
use super::super::release::Candidate;
use super::platform;

const REPORT_INTERVAL: Duration = Duration::from_secs(1);

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Debug, Clone, Copy)]
pub(super) enum TransferPurpose {
	Update {
		package_name: &'static str,
		kind: InstallKind,
	},
	MediaUpload,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransferProgress {
	Percent(u8),
	Indeterminate,
}

impl TransferProgress {
	fn due(self, last: Option<(Self, Instant)>, now: Instant) -> bool {
		let Some((last, reported_at)) = last else {
			return true;
		};
		match (last, self) {
			(Self::Percent(was), Self::Percent(is)) => {
				was != is && now.duration_since(reported_at) >= REPORT_INTERVAL
			}
			(last, next) => last != next,
		}
	}
}

pub struct TransferHold<'a, R: Runtime> {
	app: &'a AppHandle<R>,
	purpose: TransferPurpose,
	reported: Option<(TransferProgress, Instant)>,
}

impl<'a, R: Runtime> TransferHold<'a, R> {
	pub fn update(app: &'a AppHandle<R>, candidate: &Candidate) -> Self {
		let package_name = component::by_key(&candidate.component)
			.map_or(component::SELF_PACKAGE, Component::install_target);
		Self::begin(
			app,
			TransferPurpose::Update {
				package_name,
				kind: candidate.kind,
			},
		)
	}

	pub fn media_upload(app: &'a AppHandle<R>) -> Self {
		Self::begin(app, TransferPurpose::MediaUpload)
	}

	fn begin(app: &'a AppHandle<R>, purpose: TransferPurpose) -> Self {
		platform::begin_transfer(app, purpose);
		Self {
			app,
			purpose,
			reported: None,
		}
	}

	pub fn report(&mut self, progress: TransferProgress) {
		let now = Instant::now();
		if !progress.due(self.reported, now) {
			return;
		}
		self.reported = Some((progress, now));
		platform::report_transfer(self.app, self.purpose, progress);
	}
}

impl<R: Runtime> Drop for TransferHold<'_, R> {
	fn drop(&mut self) {
		platform::end_transfer(self.app, self.purpose);
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	const PERCENT_5: TransferProgress = TransferProgress::Percent(5);
	const PERCENT_6: TransferProgress = TransferProgress::Percent(6);
	const VERIFYING: TransferProgress = TransferProgress::Indeterminate;

	#[test]
	fn the_first_progress_is_reported_at_once() {
		assert!(PERCENT_5.due(None, Instant::now()));
	}

	#[test]
	fn a_moving_percent_is_reported_at_most_once_a_second() {
		let start = Instant::now();
		let last = Some((PERCENT_5, start));

		assert!(!PERCENT_6.due(last, start + Duration::from_millis(999)));
		assert!(PERCENT_6.due(last, start + REPORT_INTERVAL));
	}

	#[test]
	fn an_unchanged_percent_is_never_reported_again() {
		let start = Instant::now();
		let later = start + Duration::from_secs(60);

		assert!(!PERCENT_5.due(Some((PERCENT_5, start)), later));
	}

	#[test]
	fn verifying_is_reported_at_once_however_recent_the_last_percent() {
		let start = Instant::now();

		assert!(VERIFYING.due(Some((PERCENT_5, start)), start));
	}

	#[test]
	fn verifying_is_reported_once() {
		let start = Instant::now();
		let later = start + Duration::from_secs(60);

		assert!(!VERIFYING.due(Some((VERIFYING, start)), later));
	}
}
