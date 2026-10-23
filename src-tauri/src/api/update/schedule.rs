use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::baseline::Baseline;
use super::component::{self, Component};
use super::error::UpdateError;

const SCHEMA: u32 = 2;
const LEDGER_FILE: &str = "update-check.json";

const MIN_INTERVAL_SECS: u64 = 24 * 60 * 60;
const JITTER_SECS: u64 = 6 * 60 * 60;

static LEDGER_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Ledger {
	pub schema: u32,
	pub auto_check: bool,
	pub components: BTreeMap<String, u64>,
}

#[derive(Deserialize)]
struct LedgerV1 {
	schema: u32,
	auto_check: bool,
	next_check_at: u64,
}

impl Ledger {
	pub fn due_at(&self, component: &Component) -> Option<u64> {
		self.components.get(component.key).copied()
	}

	fn record(&mut self, component: &Component, now: u64) {
		self.components
			.insert(component.key.to_owned(), next_due_from(now));
	}

	fn seeded(mut self, now: u64) -> Self {
		for component in component::ALL {
			self.components
				.entry(component.key.to_owned())
				.or_insert_with(|| next_due_from(now));
		}
		self.components
			.retain(|key, _| component::is_known_key(key));
		self
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Trigger {
	Manual,
	Launch,
	Automatic,
}

fn now_secs() -> u64 {
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

fn exclusive() -> MutexGuard<'static, ()> {
	LEDGER_LOCK.lock().unwrap_or_else(PoisonError::into_inner)
}

pub fn load(app: &AppHandle) -> Result<Ledger, UpdateError> {
	load_from(&path(app)?)
}

fn load_from(path: &Path) -> Result<Ledger, UpdateError> {
	let _exclusive = exclusive();
	read_or_seed(path)
}

fn read_or_seed(path: &Path) -> Result<Ledger, UpdateError> {
	let raw = match fs::read(path) {
		Ok(raw) => Some(raw),
		Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
		Err(e) => return Err(e.into()),
	};
	let Decoded { ledger, needs_save } = decode(raw.as_deref(), now_secs());
	if needs_save {
		save(path, &ledger)?;
	}
	Ok(ledger)
}

struct Decoded {
	ledger: Ledger,
	needs_save: bool,
}

fn decode(raw: Option<&[u8]>, now: u64) -> Decoded {
	let current = raw
		.and_then(|raw| serde_json::from_slice::<Ledger>(raw).ok())
		.filter(|ledger| ledger.schema == SCHEMA);
	if let Some(ledger) = current {
		let seeded = ledger.clone().seeded(now);
		return Decoded {
			needs_save: seeded != ledger,
			ledger: seeded,
		};
	}

	if let Some(migrated) = raw.and_then(migrated_from_v1) {
		return Decoded {
			ledger: migrated.seeded(now),
			needs_save: true,
		};
	}

	let fresh = Ledger {
		schema: SCHEMA,
		auto_check: false,
		components: BTreeMap::new(),
	};
	Decoded {
		ledger: fresh.seeded(now),
		needs_save: true,
	}
}

fn migrated_from_v1(raw: &[u8]) -> Option<Ledger> {
	let old: LedgerV1 = serde_json::from_slice(raw).ok()?;
	if old.schema != 1 {
		return None;
	}
	Some(Ledger {
		schema: SCHEMA,
		auto_check: old.auto_check,
		components: BTreeMap::from([(
			component::APP_KEY.to_owned(),
			old.next_check_at,
		)]),
	})
}

fn save(path: &Path, ledger: &Ledger) -> Result<(), UpdateError> {
	let encoded = serde_json::to_vec(ledger)
		.map_err(|e| UpdateError::Storage(e.to_string()))?;
	super::storage::write_durably(path, &encoded)
}

pub fn set_auto_check(
	app: &AppHandle,
	enabled: bool,
) -> Result<Ledger, UpdateError> {
	set_auto_check_at(&path(app)?, enabled)
}

fn set_auto_check_at(
	path: &Path,
	enabled: bool,
) -> Result<Ledger, UpdateError> {
	let _exclusive = exclusive();
	let mut ledger = read_or_seed(path)?;
	if ledger.auto_check == enabled {
		return Ok(ledger);
	}
	ledger.auto_check = enabled;
	if enabled {
		let now = now_secs();
		for due in ledger.components.values_mut() {
			*due = next_due_from(now);
		}
	}
	save(path, &ledger)?;
	Ok(ledger)
}

fn admit(
	ledger: &Ledger,
	component: &Component,
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
	let due_at = ledger
		.due_at(component)
		.unwrap_or_else(|| next_due_from(now))
		.min(latest_plausible_due(now));
	if now < due_at {
		return Err(UpdateError::CheckTooSoon {
			retry_after_secs: due_at - now,
		});
	}
	Ok(())
}

#[must_use]
pub struct Admission {
	component: &'static Component,
	trigger: Trigger,
}

pub fn admit_check(
	app: &AppHandle,
	component: &'static Component,
	trigger: Trigger,
) -> Result<Admission, UpdateError> {
	admit_check_in(|| path(app), component, trigger, now_secs())
}

fn admit_check_in(
	ledger: impl FnOnce() -> Result<PathBuf, UpdateError>,
	component: &'static Component,
	trigger: Trigger,
	now: u64,
) -> Result<Admission, UpdateError> {
	if trigger != Trigger::Manual {
		admit(&load_from(&ledger()?)?, component, trigger, now)?;
	}
	Ok(Admission { component, trigger })
}

pub fn admit_download(
	app: &AppHandle,
	trigger: Trigger,
) -> Result<(), UpdateError> {
	admit_download_in(|| path(app), trigger)
}

fn admit_download_in(
	ledger: impl FnOnce() -> Result<PathBuf, UpdateError>,
	trigger: Trigger,
) -> Result<(), UpdateError> {
	if trigger == Trigger::Manual || load_from(&ledger()?)?.auto_check {
		return Ok(());
	}
	Err(UpdateError::AutoChecksDisabled)
}

fn worth_checking(
	component: &Component,
	baseline: &Baseline,
	trigger: Trigger,
) -> bool {
	let user_asked = trigger == Trigger::Manual;
	let installed = component.is_self() || baseline.present();
	user_asked || installed
}

impl Admission {
	pub fn worth_checking(&self, baseline: &Baseline) -> bool {
		worth_checking(self.component, baseline, self.trigger)
	}

	pub fn record(self, app: &AppHandle) -> Result<(), UpdateError> {
		self.record_in(|| path(app))
	}

	fn record_in(
		self,
		ledger: impl FnOnce() -> Result<PathBuf, UpdateError>,
	) -> Result<(), UpdateError> {
		let Self { component, trigger } = self;
		match ledger().and_then(|path| record_check_at(&path, component)) {
			Err(error) if trigger == Trigger::Manual => {
				tracing::warn!(
					"[update] {} check not recorded: {error}",
					component.key
				);
				Ok(())
			}
			recorded => recorded,
		}
	}
}

fn record_check_at(
	path: &Path,
	component: &Component,
) -> Result<(), UpdateError> {
	let _exclusive = exclusive();
	let mut ledger = read_or_seed(path)?;
	ledger.record(component, now_secs());
	save(path, &ledger)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn ledger(auto_check: bool, next_check_at: u64) -> Ledger {
		Ledger {
			schema: SCHEMA,
			auto_check,
			components: BTreeMap::from([(
				component::APP_KEY.to_owned(),
				next_check_at,
			)]),
		}
	}

	fn ledger_file(name: &str) -> PathBuf {
		let dir = std::env::temp_dir()
			.join(format!("og-ledger-{}-{name}", std::process::id()));
		let _ = fs::remove_dir_all(&dir);
		fs::create_dir_all(&dir).unwrap();
		dir.join(LEDGER_FILE)
	}

	#[test]
	fn recording_a_check_keeps_the_switch_saved_before_it() {
		let path = ledger_file("flip");
		set_auto_check_at(&path, true).unwrap();
		set_auto_check_at(&path, false).unwrap();
		record_check_at(&path, &component::APP).unwrap();
		assert!(
			!load_from(&path).unwrap().auto_check,
			"a check that finished after the opt-out must not opt back in"
		);

		set_auto_check_at(&path, true).unwrap();
		record_check_at(&path, &component::GOOGLE_OAUTH).unwrap();
		assert!(
			load_from(&path).unwrap().auto_check,
			"a check that finished after the opt-in must not opt back out"
		);

		let _ = fs::remove_dir_all(path.parent().unwrap());
	}

	#[test]
	fn a_missing_ledger_is_seeded_opted_out_and_saved() {
		let path = ledger_file("missing");

		let seeded = load_from(&path).unwrap();

		assert!(!seeded.auto_check);
		assert_eq!(
			serde_json::from_slice::<Ledger>(&fs::read(&path).unwrap())
				.unwrap(),
			seeded
		);
		let _ = fs::remove_dir_all(path.parent().unwrap());
	}

	#[test]
	fn a_ledger_that_cannot_be_read_is_reported_and_never_overwritten() {
		let path = ledger_file("unreadable-directory");
		fs::create_dir_all(&path).unwrap();
		let temp = path.with_extension("json.tmp");

		assert!(matches!(load_from(&path), Err(UpdateError::Storage(_))));
		assert!(matches!(
			set_auto_check_at(&path, true),
			Err(UpdateError::Storage(_))
		));
		assert!(matches!(
			record_check_at(&path, &component::APP),
			Err(UpdateError::Storage(_))
		));
		assert!(
			!temp.exists(),
			"a read failure must not start writing a fresh ledger"
		);
		assert!(path.is_dir());
		let _ = fs::remove_dir_all(path.parent().unwrap());
	}

	#[cfg(unix)]
	#[test]
	fn a_transient_read_failure_keeps_the_saved_consent() {
		use std::os::unix::fs::PermissionsExt;

		let path = ledger_file("unreadable-permissions");
		set_auto_check_at(&path, true).unwrap();
		let before = fs::read(&path).unwrap();
		fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).unwrap();
		let denied = fs::read(&path).is_err();

		let recorded = record_check_at(&path, &component::APP);
		let loaded = load_from(&path);
		fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();

		if denied {
			assert!(matches!(recorded, Err(UpdateError::Storage(_))));
			assert!(matches!(loaded, Err(UpdateError::Storage(_))));
			assert_eq!(fs::read(&path).unwrap(), before);
		}
		assert!(
			load_from(&path).unwrap().auto_check,
			"a failed read must never turn automatic checks off"
		);
		let _ = fs::remove_dir_all(path.parent().unwrap());
	}

	#[test]
	fn a_manual_check_goes_ahead_when_the_ledger_is_unreadable() {
		let path = ledger_file("manual-unreadable");
		fs::create_dir_all(&path).unwrap();

		let admission = admit_check_in(
			|| Ok(path.clone()),
			&component::GOOGLE_OAUTH,
			Trigger::Manual,
			10_000,
		)
		.unwrap();
		assert!(
			admission.record_in(|| Ok(path.clone())).is_ok(),
			"a check the user asked for must still show its result"
		);
		let admission = admit_check_in(
			|| Err(UpdateError::Storage("no data directory".into())),
			&component::APP,
			Trigger::Manual,
			10_000,
		)
		.unwrap();
		assert!(admission
			.record_in(|| Err(UpdateError::Storage("no data directory".into())))
			.is_ok());
		assert!(path.is_dir());
		let _ = fs::remove_dir_all(path.parent().unwrap());
	}

	#[test]
	fn an_unattended_check_is_refused_when_the_ledger_is_unreadable() {
		let path = ledger_file("unattended-unreadable");
		fs::create_dir_all(&path).unwrap();

		for trigger in [Trigger::Launch, Trigger::Automatic] {
			assert!(
				matches!(
					admit_check_in(
						|| Ok(path.clone()),
						&component::APP,
						trigger,
						10_000
					),
					Err(UpdateError::Storage(_))
				),
				"a {trigger:?} check must not reach the network without a due date"
			);
		}
		assert!(path.is_dir());
		let _ = fs::remove_dir_all(path.parent().unwrap());
	}

	#[test]
	fn a_download_the_user_started_needs_no_ledger() {
		assert!(admit_download_in(
			|| Err(UpdateError::Storage("no data directory".into())),
			Trigger::Manual,
		)
		.is_ok());
	}

	#[test]
	fn an_unattended_download_waits_for_automatic_checks() {
		let missing = ledger_file("download-missing");
		let opted_out = ledger_file("download-opted-out");
		save(&opted_out, &ledger(false, 0)).unwrap();
		let opted_in = ledger_file("download-opted-in");
		save(&opted_in, &ledger(true, u64::MAX)).unwrap();

		for trigger in [Trigger::Launch, Trigger::Automatic] {
			for refused in [&missing, &opted_out] {
				assert!(
					matches!(
						admit_download_in(|| Ok(refused.clone()), trigger),
						Err(UpdateError::AutoChecksDisabled)
					),
					"a {trigger:?} download must not start while automatic checks are off"
				);
			}
			assert!(
				admit_download_in(|| Ok(opted_in.clone()), trigger).is_ok(),
				"a {trigger:?} download ignores the check interval"
			);
		}
		for path in [missing, opted_out, opted_in] {
			let _ = fs::remove_dir_all(path.parent().unwrap());
		}
	}

	#[test]
	fn an_unattended_download_is_refused_when_the_ledger_is_unreadable() {
		let path = ledger_file("download-unreadable");
		fs::create_dir_all(&path).unwrap();

		assert!(matches!(
			admit_download_in(|| Ok(path.clone()), Trigger::Launch),
			Err(UpdateError::Storage(_))
		));
		assert!(path.is_dir());
		let _ = fs::remove_dir_all(path.parent().unwrap());
	}

	#[test]
	fn an_admitted_unattended_check_that_cannot_record_is_reported() {
		let readable = ledger_file("unattended-admitted");
		save(&readable, &ledger(true, 0)).unwrap();
		let unreadable = ledger_file("unattended-unrecordable");
		fs::create_dir_all(&unreadable).unwrap();

		for trigger in [Trigger::Launch, Trigger::Automatic] {
			let admission = admit_check_in(
				|| Ok(readable.clone()),
				&component::APP,
				trigger,
				10_000,
			)
			.unwrap();
			assert!(
				matches!(
					admission.record_in(|| Ok(unreadable.clone())),
					Err(UpdateError::Storage(_))
				),
				"a {trigger:?} check that cannot move its due date would \
				 reach the network on every tick"
			);
		}
		assert!(unreadable.is_dir());
		let _ = fs::remove_dir_all(readable.parent().unwrap());
		let _ = fs::remove_dir_all(unreadable.parent().unwrap());
	}

	#[test]
	fn a_manual_check_still_moves_the_due_date_when_it_can() {
		let path = ledger_file("manual-records");
		save(&path, &ledger(true, 1)).unwrap();

		admit_check_in(
			|| Ok(path.clone()),
			&component::APP,
			Trigger::Manual,
			10_000,
		)
		.unwrap()
		.record_in(|| Ok(path.clone()))
		.unwrap();

		assert!(load_from(&path).unwrap().due_at(&component::APP) > Some(1));
		let _ = fs::remove_dir_all(path.parent().unwrap());
	}

	#[test]
	fn simultaneous_checks_keep_both_due_dates_and_both_writes() {
		let path = ledger_file("simultaneous");
		for _ in 0..64 {
			save(
				&path,
				&Ledger {
					schema: SCHEMA,
					auto_check: true,
					components: BTreeMap::from([
						(component::APP_KEY.to_owned(), 1),
						(component::GOOGLE_OAUTH.key.to_owned(), 1),
					]),
				},
			)
			.unwrap();
			let start = std::sync::Arc::new(std::sync::Barrier::new(2));
			let checks = [&component::APP, &component::GOOGLE_OAUTH].map(
				|checked: &'static Component| {
					let path = path.clone();
					let start = start.clone();
					std::thread::spawn(move || {
						start.wait();
						record_check_at(&path, checked)
					})
				},
			);
			for check in checks {
				check.join().unwrap().expect("a good check must not fail");
			}

			let recorded = load_from(&path).unwrap();
			assert!(recorded.due_at(&component::APP) > Some(1));
			assert!(recorded.due_at(&component::GOOGLE_OAUTH) > Some(1));
		}
		let _ = fs::remove_dir_all(path.parent().unwrap());
	}

	#[test]
	fn an_absent_addon_is_only_ever_checked_on_purpose() {
		for trigger in [Trigger::Launch, Trigger::Automatic] {
			assert!(
				!worth_checking(
					&component::GOOGLE_OAUTH,
					&Baseline::Absent,
					trigger
				),
				"an unattended {trigger:?} check would disclose interest in \
				 an addon the user never asked for"
			);
			assert!(
				worth_checking(&component::APP, &Baseline::Absent, trigger),
				"the app itself is always installed, so it always checks"
			);
		}

		assert!(worth_checking(
			&component::GOOGLE_OAUTH,
			&Baseline::Absent,
			Trigger::Manual
		));
		assert!(worth_checking(
			&component::GOOGLE_OAUTH,
			&Baseline::of_version(semver::Version::new(1, 1, 0)),
			Trigger::Automatic
		));
	}

	#[test]
	fn an_admission_judges_worth_by_the_trigger_it_was_admitted_for() {
		let path = ledger_file("admission-worth");
		let mut due = ledger(true, 0);
		due.components
			.insert(component::GOOGLE_OAUTH.key.to_owned(), 0);
		save(&path, &due).unwrap();
		let admitted = |trigger| {
			admit_check_in(
				|| Ok(path.clone()),
				&component::GOOGLE_OAUTH,
				trigger,
				10_000,
			)
			.unwrap()
		};

		assert!(!admitted(Trigger::Automatic).worth_checking(&Baseline::Absent));
		assert!(!admitted(Trigger::Launch).worth_checking(&Baseline::Absent));
		assert!(admitted(Trigger::Manual).worth_checking(&Baseline::Absent));
		let _ = fs::remove_dir_all(path.parent().unwrap());
	}

	#[test]
	fn recording_one_components_check_does_not_move_anothers_due_date() {
		let mut ledger = ledger(true, 999_999);
		ledger
			.components
			.insert(component::GOOGLE_OAUTH.key.to_owned(), 10_000);

		ledger.record(&component::GOOGLE_OAUTH, 10_000);

		assert_eq!(ledger.due_at(&component::APP), Some(999_999));
		assert!(
			ledger.due_at(&component::GOOGLE_OAUTH)
				>= Some(10_000 + MIN_INTERVAL_SECS)
		);
	}

	#[test]
	fn admission_reads_only_the_components_own_due_date() {
		let mut ledger = ledger(true, 10_000);
		ledger
			.components
			.insert(component::GOOGLE_OAUTH.key.to_owned(), 10_000);

		ledger
			.components
			.insert(component::APP_KEY.to_owned(), 999_999);

		assert!(admit(
			&ledger,
			&component::GOOGLE_OAUTH,
			Trigger::Automatic,
			10_000
		)
		.is_ok());
		assert!(matches!(
			admit(&ledger, &component::APP, Trigger::Automatic, 10_000),
			Err(UpdateError::CheckTooSoon { .. })
		));
	}

	#[test]
	fn a_component_with_no_record_waits_a_full_interval() {
		let bare = Ledger {
			schema: SCHEMA,
			auto_check: true,
			components: BTreeMap::new(),
		};
		let error = admit(&bare, &component::APP, Trigger::Automatic, 10_000)
			.unwrap_err();
		let UpdateError::CheckTooSoon { retry_after_secs } = error else {
			panic!("a component nobody has checked must not be due at once");
		};
		assert!(retry_after_secs >= MIN_INTERVAL_SECS);
	}

	#[test]
	fn seeding_gives_every_component_a_date_and_forgets_retired_ones() {
		let seeded = Ledger {
			schema: SCHEMA,
			auto_check: true,
			components: BTreeMap::from([
				("retired-component".to_owned(), 1),
				(component::APP_KEY.to_owned(), 4_242),
			]),
		}
		.seeded(10_000);

		assert_eq!(seeded.due_at(&component::APP), Some(4_242));
		assert!(seeded.due_at(&component::GOOGLE_OAUTH).is_some());
		assert!(!seeded.components.contains_key("retired-component"));
		assert_eq!(seeded.components.len(), component::ALL.len());
	}

	#[test]
	fn the_ledger_is_stored_in_snake_case() {
		let encoded =
			serde_json::to_string(&ledger(true, 4_242)).expect("encodes");
		assert!(encoded.contains("\"auto_check\""), "{encoded}");
		assert!(encoded.contains("\"components\""), "{encoded}");
		assert!(!encoded.contains("autoCheck"), "{encoded}");
	}

	#[test]
	fn decoding_a_v1_document_migrates_it_rather_than_starting_over() {
		let v1 = br#"{"schema":1,"auto_check":true,"next_check_at":4242}"#;
		let Decoded { ledger, needs_save } = decode(Some(v1), 10_000);

		assert!(ledger.auto_check, "consent must survive the upgrade");
		assert_eq!(ledger.due_at(&component::APP), Some(4_242));
		assert!(needs_save, "a migrated ledger must be written back");
		assert!(ledger.due_at(&component::GOOGLE_OAUTH).is_some());
	}

	#[test]
	fn decoding_nothing_opts_the_user_out_and_saves() {
		let Decoded { ledger, needs_save } = decode(None, 10_000);
		assert!(!ledger.auto_check);
		assert!(needs_save);

		assert!(!decode(Some(b"} not json {"), 10_000).ledger.auto_check);
	}

	#[test]
	fn decoding_a_current_document_leaves_it_alone() {
		let encoded = serde_json::to_vec(&ledger(true, 4_242).seeded(0))
			.expect("encodes");
		let Decoded { ledger, needs_save } = decode(Some(&encoded), 10_000);

		assert!(ledger.auto_check);
		assert_eq!(ledger.due_at(&component::APP), Some(4_242));
		assert!(!needs_save, "an unchanged ledger must not be rewritten");
	}

	#[test]
	fn an_upgraded_ledger_keeps_the_consent_and_the_apps_due_date() {
		let v1 = br#"{"schema":1,"auto_check":true,"next_check_at":4242}"#;
		let migrated = migrated_from_v1(v1).expect("v1 ledger migrates");

		assert!(migrated.auto_check, "consent must survive the upgrade");
		assert_eq!(migrated.due_at(&component::APP), Some(4_242));
		assert_eq!(migrated.schema, SCHEMA);

		let off = br#"{"schema":1,"auto_check":false,"next_check_at":1}"#;
		assert!(!migrated_from_v1(off).unwrap().auto_check);

		assert!(
			migrated_from_v1(br#"{"schema":2,"auto_check":true}"#).is_none(),
			"only a v1 document may be migrated"
		);
	}

	#[test]
	fn automatic_checks_are_off_until_turned_on() {
		let error = admit(
			&ledger(false, 0),
			&component::APP,
			Trigger::Automatic,
			10_000,
		)
		.unwrap_err();
		assert!(matches!(error, UpdateError::AutoChecksDisabled));
	}

	#[test]
	fn automatic_checks_wait_for_the_interval() {
		let ledger = ledger(true, 10_000);
		assert!(
			admit(&ledger, &component::APP, Trigger::Automatic, 9_999).is_err()
		);
		assert!(
			admit(&ledger, &component::APP, Trigger::Automatic, 10_000).is_ok()
		);
	}

	#[test]
	fn automatic_checks_inside_the_window_never_reach_the_network() {
		let ledger = ledger(true, 10_000);
		let requests_admitted = (0..500)
			.filter(|launch| {
				admit(
					&ledger,
					&component::APP,
					Trigger::Automatic,
					9_000 + launch,
				)
				.is_ok()
			})
			.count();
		assert_eq!(requests_admitted, 0);
	}

	#[test]
	fn a_launch_check_ignores_the_interval_but_not_the_opt_in() {
		let due_later = ledger(true, 10_000 + MIN_INTERVAL_SECS);
		assert!(
			admit(&due_later, &component::APP, Trigger::Launch, 10_000).is_ok()
		);
		assert!(matches!(
			admit(&due_later, &component::APP, Trigger::Automatic, 10_000)
				.unwrap_err(),
			UpdateError::CheckTooSoon { .. }
		));
		assert!(matches!(
			admit(&ledger(false, 0), &component::APP, Trigger::Launch, 10_000)
				.unwrap_err(),
			UpdateError::AutoChecksDisabled
		));
	}

	#[test]
	fn a_manual_check_always_runs() {
		assert!(admit(
			&ledger(false, u64::MAX),
			&component::APP,
			Trigger::Manual,
			0
		)
		.is_ok());
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
		let ledger = ledger(true, now + 4000 * MIN_INTERVAL_SECS);

		let error = admit(&ledger, &component::APP, Trigger::Automatic, now)
			.unwrap_err();
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
		assert!(admit(
			&ledger,
			&component::APP,
			Trigger::Automatic,
			1_600_000_000
		)
		.is_err());
	}
}
