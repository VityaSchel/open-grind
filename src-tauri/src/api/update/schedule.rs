use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::error::UpdateError;

const SCHEMA: u32 = 1;
const LEDGER_FILE: &str = "update-check.json";

const MIN_INTERVAL_SECS: u64 = 24 * 60 * 60;
const JITTER_SECS: u64 = 6 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Ledger {
	pub schema: u32,
	pub auto_check: bool,
	pub next_check_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Trigger {
	Manual,
	Launch,
	Automatic,
}

pub fn now_secs() -> u64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map(|d| d.as_secs())
		.unwrap_or(0)
}

fn jitter() -> u64 {
	let nanos = SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map(|d| d.subsec_nanos() as u64)
		.unwrap_or(0);
	nanos % (JITTER_SECS + 1)
}

fn latest_plausible_due(now: u64) -> u64 {
	now.saturating_add(MIN_INTERVAL_SECS)
		.saturating_add(JITTER_SECS)
}

fn next_due_from(now: u64) -> u64 {
	now.saturating_add(MIN_INTERVAL_SECS)
		.saturating_add(jitter())
}

fn path(app: &AppHandle) -> Result<PathBuf, UpdateError> {
	let dir = app
		.path()
		.app_local_data_dir()
		.map_err(|e| UpdateError::Storage(e.to_string()))?;
	fs::create_dir_all(&dir)?;
	Ok(dir.join(LEDGER_FILE))
}

pub fn load(app: &AppHandle) -> Result<Ledger, UpdateError> {
	let path = path(app)?;
	let stored = fs::read(&path)
		.ok()
		.and_then(|raw| serde_json::from_slice::<Ledger>(&raw).ok())
		.filter(|ledger| ledger.schema == SCHEMA);

	match stored {
		Some(ledger) => Ok(ledger),
		None => {
			let fresh = Ledger {
				schema: SCHEMA,
				auto_check: false,
				next_check_at: next_due_from(now_secs()),
			};
			save(app, &fresh)?;
			Ok(fresh)
		}
	}
}

pub fn save(app: &AppHandle, ledger: &Ledger) -> Result<(), UpdateError> {
	let path = path(app)?;
	let encoded = serde_json::to_vec(ledger)
		.map_err(|e| UpdateError::Storage(e.to_string()))?;
	super::storage::write_durably(&path, &encoded)
}

pub fn set_auto_check(
	app: &AppHandle,
	enabled: bool,
) -> Result<Ledger, UpdateError> {
	let mut ledger = load(app)?;
	if ledger.auto_check == enabled {
		return Ok(ledger);
	}
	ledger.auto_check = enabled;
	if enabled {
		ledger.next_check_at = next_due_from(now_secs());
	}
	save(app, &ledger)?;
	Ok(ledger)
}

pub fn admit(
	ledger: &Ledger,
	trigger: Trigger,
	now: u64,
) -> Result<(), UpdateError> {
	if trigger == Trigger::Manual {
		return Ok(());
	}
	if !ledger.auto_check {
		return Err(UpdateError::AutoChecksDisabled);
	}
	if trigger == Trigger::Launch {
		return Ok(());
	}
	let due_at = ledger.next_check_at.min(latest_plausible_due(now));
	if now < due_at {
		return Err(UpdateError::CheckTooSoon {
			retry_after_secs: due_at - now,
		});
	}
	Ok(())
}

pub fn record_check(
	app: &AppHandle,
	ledger: &mut Ledger,
) -> Result<(), UpdateError> {
	ledger.next_check_at = next_due_from(now_secs());
	save(app, ledger)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn ledger(auto_check: bool, next_check_at: u64) -> Ledger {
		Ledger {
			schema: SCHEMA,
			auto_check,
			next_check_at,
		}
	}

	#[test]
	fn automatic_checks_are_off_until_turned_on() {
		let error =
			admit(&ledger(false, 0), Trigger::Automatic, 10_000).unwrap_err();
		assert!(matches!(error, UpdateError::AutoChecksDisabled));
	}

	#[test]
	fn automatic_checks_wait_for_the_interval() {
		let ledger = ledger(true, 10_000);
		assert!(admit(&ledger, Trigger::Automatic, 9_999).is_err());
		assert!(admit(&ledger, Trigger::Automatic, 10_000).is_ok());
	}

	#[test]
	fn automatic_checks_inside_the_window_never_reach_the_network() {
		let ledger = ledger(true, 10_000);
		let requests_admitted = (0..500)
			.filter(|launch| {
				admit(&ledger, Trigger::Automatic, 9_000 + launch).is_ok()
			})
			.count();
		assert_eq!(requests_admitted, 0);
	}

	#[test]
	fn a_launch_check_ignores_the_interval_but_not_the_opt_in() {
		let due_later = Ledger {
			schema: SCHEMA,
			auto_check: true,
			next_check_at: 10_000 + MIN_INTERVAL_SECS,
		};
		assert!(admit(&due_later, Trigger::Launch, 10_000).is_ok());
		assert!(matches!(
			admit(&due_later, Trigger::Automatic, 10_000).unwrap_err(),
			UpdateError::CheckTooSoon { .. }
		));
		assert!(matches!(
			admit(&ledger(false, 0), Trigger::Launch, 10_000).unwrap_err(),
			UpdateError::AutoChecksDisabled
		));
	}

	#[test]
	fn a_manual_check_always_runs() {
		assert!(admit(&ledger(false, u64::MAX), Trigger::Manual, 0).is_ok());
	}

	#[test]
	fn the_next_slot_is_at_least_a_day_out_and_never_beyond_the_jitter_window()
	{
		let now = 1_700_000_000;
		for _ in 0..64 {
			let next = next_due_from(now);
			assert!(next >= now + MIN_INTERVAL_SECS);
			assert!(next <= now + MIN_INTERVAL_SECS + JITTER_SECS);
		}
	}

	#[test]
	fn a_corrupt_far_future_due_time_cannot_park_auto_checks_forever() {
		let now = 1_000_000;
		let ledger = Ledger {
			schema: SCHEMA,
			auto_check: true,
			next_check_at: now + 4000 * MIN_INTERVAL_SECS,
		};

		let error = admit(&ledger, Trigger::Automatic, now).unwrap_err();
		let UpdateError::CheckTooSoon { retry_after_secs } = error else {
			panic!("expected CheckTooSoon");
		};
		assert!(
            retry_after_secs <= MIN_INTERVAL_SECS + JITTER_SECS,
            "waited {retry_after_secs}s, which is beyond any schedule this code can write"
        );
	}

	#[test]
	fn a_rolled_back_clock_cannot_bring_a_check_forward() {
		let ledger = ledger(true, next_due_from(1_700_000_000));
		assert!(admit(&ledger, Trigger::Automatic, 1_600_000_000).is_err());
	}
}
