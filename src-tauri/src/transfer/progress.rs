use std::time::{Duration, Instant};

use tauri::Runtime;

use super::{platform, TransferHold};

const REPORT_INTERVAL: Duration = Duration::from_secs(1);

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

impl<R: Runtime> TransferHold<'_, R> {
	pub fn report(&mut self, progress: TransferProgress) {
		let now = Instant::now();
		if !progress.due(self.reported, now) {
			return;
		}
		self.reported = Some((progress, now));
		platform::report_transfer(self.app, self.purpose, progress);
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
