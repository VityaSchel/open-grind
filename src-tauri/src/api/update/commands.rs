use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::error::UpdateError;
use super::install::{self, Capability};
use super::release::Candidate;
use super::schedule::Trigger;
use super::session::Session;
use super::{
	client, current_version, release, schedule, storage, verify, Progress,
	UpdateState,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
	pub available: bool,
	pub current_version: String,
	pub release: Option<Candidate>,
}

#[derive(Debug, Serialize)]
#[serde(
	rename_all = "camelCase",
	rename_all_fields = "camelCase",
	tag = "state",
	content = "detail"
)]
pub enum Readiness {
	Ready {
		tag: String,
		version: String,
		can_install_now: bool,
	},
	Resumable {
		tag: String,
		version: String,
	},
	NothingStaged,
	Unsupported(install::Unsupported),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
	pub auto_check: bool,
	pub next_check_at: u64,
}

impl From<schedule::Ledger> for Settings {
	fn from(ledger: schedule::Ledger) -> Self {
		Self {
			auto_check: ledger.auto_check,
			next_check_at: ledger.next_check_at,
		}
	}
}

#[tauri::command]
pub fn update_capability(app: AppHandle) -> Capability {
	install::capability(&app)
}

#[tauri::command]
pub fn update_settings(app: AppHandle) -> Result<Settings, UpdateError> {
	Ok(schedule::load(&app)?.into())
}

#[tauri::command]
pub fn update_set_auto_check(
	app: AppHandle,
	enabled: bool,
) -> Result<Settings, UpdateError> {
	Ok(schedule::set_auto_check(&app, enabled)?.into())
}

#[tauri::command]
pub async fn update_check(
	app: AppHandle,
	trigger: Trigger,
) -> Result<CheckResult, UpdateError> {
	let Session {
		current,
		payload_suffix,
		..
	} = Session::open(&app)?;
	let mut ledger = schedule::load(&app)?;
	schedule::admit(&ledger, trigger, schedule::now_secs())?;

	let index = release::fetch_index(&current).await?;
	schedule::record_check(&app, &mut ledger)?;

	let candidate = release::newest_upgrade(&index, &current, &payload_suffix)?;
	let state = app.state::<UpdateState>();
	state.downloads.retain_only(candidate.as_ref());
	*state.latest.lock().unwrap() = candidate.clone();

	Ok(CheckResult {
		available: candidate.is_some(),
		current_version: current.to_string(),
		release: candidate,
	})
}

#[tauri::command]
pub async fn update_download(app: AppHandle) -> Result<Progress, UpdateError> {
	let Session {
		root,
		current,
		payload_suffix,
	} = Session::open(&app)?;

	let state = app.state::<UpdateState>();
	let known = state.latest.lock().unwrap().clone();
	let candidate = match known.or_else(|| state.downloads.retained_candidate())
	{
		Some(candidate) => candidate,
		None if storage::resumable(&root, &current).is_some() => {
			let index = release::fetch_index(&current).await?;
			release::newest_upgrade(&index, &current, &payload_suffix)?
				.ok_or(UpdateError::NothingStaged)?
		}
		None => return Err(UpdateError::NothingStaged),
	};

	let client = client::build()?;
	let state = app.state::<UpdateState>();
	let downloads = &state.inner().downloads;
	downloads.cancel_others_and_join(&candidate).await;
	storage::purge(&root, &current, Some(&candidate.tag));
	Ok(downloads.start(&app, root, client, candidate).await)
}

#[tauri::command]
pub async fn update_cancel_download(app: AppHandle) {
	let downloads = &app.state::<UpdateState>().inner().downloads;
	downloads.cancel().await;
}

#[tauri::command]
pub fn update_progress(app: AppHandle) -> Option<Progress> {
	app.state::<UpdateState>().downloads.snapshot()
}

#[tauri::command]
pub fn update_readiness(app: AppHandle) -> Result<Readiness, UpdateError> {
	let can_install_now = match install::capability(&app) {
		Capability::Supported {
			can_install_now, ..
		} => can_install_now,
		Capability::Unsupported(reason) => {
			return Ok(Readiness::Unsupported(reason))
		}
	};

	let root = storage::root(&app)?;
	let current = current_version(&app)?;
	if let Some((_, staged)) = storage::verified(&root, &current) {
		return Ok(Readiness::Ready {
			tag: staged.tag,
			version: staged.version,
			can_install_now,
		});
	}
	Ok(match storage::resumable(&root, &current) {
		Some(candidate) => Readiness::Resumable {
			tag: candidate.tag,
			version: candidate.version,
		},
		None => Readiness::NothingStaged,
	})
}

#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), UpdateError> {
	let Session { root, current, .. } = Session::open(&app)?;
	let (stage, staged) =
		storage::verified(&root, &current).ok_or(UpdateError::NothingStaged)?;

	let recorded = staged.payload_digest.ok_or(UpdateError::NothingStaged)?;
	let checked = stage.clone();
	tauri::async_runtime::spawn_blocking(move || {
		unchanged_since_verification(&checked, &recorded)
	})
	.await
	.map_err(|e| UpdateError::Storage(e.to_string()))??;

	install::install(&app, &stage.payload()).await
}

fn unchanged_since_verification(
	stage: &storage::Stage,
	recorded: &str,
) -> Result<(), UpdateError> {
	if verify::payload_digest(&stage.payload())? == recorded {
		return Ok(());
	}
	let _ = stage.discard();
	Err(UpdateError::Signature(
		"staged payload changed after it was verified".into(),
	))
}

#[tauri::command]
pub fn update_take_install_outcome(app: AppHandle) -> Option<install::Outcome> {
	install::take_outcome(&app)
}

#[tauri::command]
pub fn update_open_install_permission_settings(
	app: AppHandle,
) -> Result<(), UpdateError> {
	install::open_install_permission_settings(&app)
}
#[tauri::command]
pub async fn update_discard(app: AppHandle) -> Result<(), UpdateError> {
	let state = app.state::<UpdateState>();
	state.inner().downloads.cancel_and_join().await;
	state.downloads.forget_retained();
	*state.latest.lock().unwrap() = None;
	let root = storage::root(&app)?;
	match std::fs::remove_dir_all(&root) {
		Ok(()) => Ok(()),
		Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
		Err(e) => Err(e.into()),
	}
}

#[cfg(test)]
mod staged_payload_tests {
	use super::*;

	fn staged_payload(
		name: &str,
		bytes: &[u8],
	) -> (std::path::PathBuf, storage::Stage) {
		let root = std::env::temp_dir()
			.join(format!("og-install-{}-{name}", std::process::id()));
		let _ = std::fs::remove_dir_all(&root);
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		std::fs::write(stage.payload(), bytes).unwrap();
		(root, stage)
	}

	#[test]
	fn an_untouched_payload_is_allowed_to_install() {
		let (root, stage) = staged_payload("good", b"installable bytes");
		let recorded = verify::payload_digest(&stage.payload()).unwrap();

		unchanged_since_verification(&stage, &recorded).unwrap();

		assert!(stage.payload().exists());
		let _ = std::fs::remove_dir_all(root);
	}

	#[test]
	fn a_payload_swapped_after_verification_is_refused_and_dropped() {
		let (root, stage) = staged_payload("swapped", b"installable bytes");
		let recorded = verify::payload_digest(&stage.payload()).unwrap();
		std::fs::write(stage.payload(), b"someone else's bytes").unwrap();

		let error =
			unchanged_since_verification(&stage, &recorded).unwrap_err();

		assert!(matches!(error, UpdateError::Signature(_)), "{error:?}");
		assert!(
			!stage.payload().exists(),
			"a swapped payload must not stay installable"
		);
		let _ = std::fs::remove_dir_all(root);
	}
}

#[cfg(test)]
mod wire_tests {
	use super::super::download;
	use super::*;

	fn json<T: Serialize>(value: &T) -> serde_json::Value {
		serde_json::to_value(value).unwrap()
	}

	#[test]
	fn the_frontend_contract_is_camel_case_everywhere() {
		assert_eq!(
			json(&Readiness::Ready {
				tag: "v0.2.0".into(),
				version: "0.2.0".into(),
				can_install_now: false,
			}),
			serde_json::json!({
				"state": "ready",
				"detail": { "tag": "v0.2.0", "version": "0.2.0", "canInstallNow": false }
			})
		);
		assert_eq!(
			json(&Readiness::NothingStaged),
			serde_json::json!({ "state": "nothingStaged" })
		);
		assert_eq!(
			json(&Readiness::Resumable {
				tag: "v0.2.0".into(),
				version: "0.2.0".into(),
			}),
			serde_json::json!({
				"state": "resumable",
				"detail": { "tag": "v0.2.0", "version": "0.2.0" }
			})
		);

		assert_eq!(
			json(&Capability::Supported {
				payload_suffix: ".apk".into(),
				can_install_now: true,
			}),
			serde_json::json!({
				"state": "supported",
				"detail": { "payloadSuffix": ".apk", "canInstallNow": true }
			})
		);
		assert_eq!(
			json(&Capability::Unsupported(
				install::Unsupported::ExternallyManaged {
					installer: "org.fdroid.fdroid".into()
				}
			)),
			serde_json::json!({
				"state": "unsupported",
				"detail": { "reason": "externallyManaged", "detail": { "installer": "org.fdroid.fdroid" } }
			})
		);

		assert_eq!(
			json(&UpdateError::CheckTooSoon {
				retry_after_secs: 60
			}),
			serde_json::json!({ "kind": "checkTooSoon", "detail": { "retryAfterSecs": 60 } })
		);
		assert_eq!(
			json(&UpdateError::Signature("bad".into())),
			serde_json::json!({ "kind": "signature", "detail": "bad" })
		);
		assert_eq!(
			json(&UpdateError::Unsigned {
				tag: "v0.2.0".into()
			}),
			serde_json::json!({ "kind": "unsigned", "detail": { "tag": "v0.2.0" } })
		);
	}

	#[test]
	fn progress_reports_its_phase_as_flat_fields() {
		let progress = Progress {
			tag: "v0.2.0".into(),
			version: "0.2.0".into(),
			phase: download::Phase::Downloading,
			received: 1024,
			total: 4096,
		};
		assert_eq!(
			json(&progress),
			serde_json::json!({
				"tag": "v0.2.0",
				"version": "0.2.0",
				"phase": "downloading",
				"received": 1024,
				"total": 4096
			})
		);

		let failed = Progress {
			phase: download::Phase::Failed(UpdateError::Oversize),
			..progress
		};
		assert_eq!(json(&failed)["phase"], "failed");
		assert_eq!(json(&failed)["detail"]["kind"], "oversize");
	}
}
