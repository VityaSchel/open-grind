use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::baseline::InstallKind;
use super::component;
use super::error::UpdateError;
use super::install::{self, Capability};
use super::release::Candidate;
use super::schedule::Trigger;
use super::session::Session;
use super::{
	client, release, schedule, storage, verify, Progress, UpdateState,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
	pub available: bool,
	pub current_version: Option<String>,
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
		kind: InstallKind,
		can_install_now: bool,
	},
	Resumable {
		tag: String,
		version: String,
		kind: InstallKind,
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
			next_check_at: ledger.due_at(&component::APP).unwrap_or_default(),
		}
	}
}

#[tauri::command]
pub fn updater_capability(app: AppHandle) -> Capability {
	install::capability_for(&app, &component::APP)
}

#[tauri::command]
pub fn updater_settings(app: AppHandle) -> Result<Settings, UpdateError> {
	Ok(schedule::load(&app)?.into())
}

#[tauri::command]
pub fn updater_set_auto_check(
	app: AppHandle,
	enabled: bool,
) -> Result<Settings, UpdateError> {
	Ok(schedule::set_auto_check(&app, enabled)?.into())
}

#[tauri::command]
pub async fn updater_check(
	app: AppHandle,
	component: String,
	trigger: Trigger,
) -> Result<CheckResult, UpdateError> {
	let component = component::by_key(&component)?;
	let admission = schedule::admit_check(&app, component, trigger)?;
	let session = Session::open(&app, component)?;
	if !admission.worth_checking(&session.baseline) {
		admission.record(&app)?;
		app.state::<UpdateState>().withdraw_updates(component.key);
		return Ok(CheckResult {
			available: false,
			current_version: session.baseline.installed_version(),
			release: None,
		});
	}

	let index = release::fetch_index(component, session.channel).await?;
	admission.record(&app)?;

	let candidate = session.newest_upgrade(&index)?;
	let state = app.state::<UpdateState>();
	state
		.downloads
		.retain_only(component.key, candidate.as_ref());
	state.offer(component.key, candidate.clone());

	Ok(CheckResult {
		available: candidate.is_some(),
		current_version: session.baseline.installed_version(),
		release: candidate,
	})
}

#[tauri::command]
pub async fn updater_download(
	app: AppHandle,
	component: String,
) -> Result<Progress, UpdateError> {
	let session = Session::open(&app, component::by_key(&component)?)?;
	let component = session.component;

	let state = app.state::<UpdateState>();
	let candidate = match state.reusable(component.key, &session.baseline) {
		Some(candidate) => candidate,
		None if storage::resumable(
			component,
			&session.root,
			&session.baseline,
		)
		.is_some() =>
		{
			let index =
				release::fetch_index(component, session.channel).await?;
			session
				.newest_upgrade(&index)?
				.ok_or(UpdateError::NothingStaged)?
		}
		None => return Err(UpdateError::NothingStaged),
	};

	let client = client::build()?;
	let state = app.state::<UpdateState>();
	let downloads = &state.inner().downloads;
	let starting = candidate.clone();
	downloads
		.start(&app, session.root.clone(), client, candidate, || {
			storage::purge(
				component,
				&session.root,
				&session.baseline,
				Some(&starting),
			)
		})
		.await
}

#[tauri::command]
pub async fn updater_cancel_download(
	app: AppHandle,
	component: String,
) -> Result<(), UpdateError> {
	let component = component::by_key(&component)?;
	let downloads = &app.state::<UpdateState>().inner().downloads;
	downloads.cancel(component.key).await;
	Ok(())
}

#[tauri::command]
pub fn updater_progress(app: AppHandle) -> Option<Progress> {
	app.state::<UpdateState>().downloads.snapshot()
}

#[tauri::command]
pub fn updater_readiness(
	app: AppHandle,
	component: String,
) -> Result<Readiness, UpdateError> {
	let Session {
		component,
		root,
		baseline,
		can_install_now,
		..
	} = match Session::open(&app, component::by_key(&component)?) {
		Err(UpdateError::Unsupported(reason)) => {
			return Ok(Readiness::Unsupported(reason))
		}
		opened => opened?,
	};
	if let Some((_, staged)) = storage::verified(component, &root, &baseline) {
		return Ok(Readiness::Ready {
			tag: staged.tag,
			version: staged.version,
			kind: baseline.kind(),
			can_install_now,
		});
	}
	Ok(match storage::resumable(component, &root, &baseline) {
		Some(candidate) => Readiness::Resumable {
			tag: candidate.tag,
			version: candidate.version,
			kind: baseline.kind(),
		},
		None => Readiness::NothingStaged,
	})
}

#[tauri::command]
pub async fn updater_install(
	app: AppHandle,
	component: String,
) -> Result<(), UpdateError> {
	let Session {
		component,
		root,
		baseline,
		..
	} = Session::open(&app, component::by_key(&component)?)?;
	let (stage, staged) = storage::verified(component, &root, &baseline)
		.ok_or(UpdateError::NothingStaged)?;

	let recorded = staged.payload_digest.ok_or(UpdateError::NothingStaged)?;
	let checked = stage.clone();
	tauri::async_runtime::spawn_blocking(move || {
		unchanged_since_verification(&checked, &recorded)
	})
	.await
	.map_err(|e| UpdateError::Storage(e.to_string()))??;

	install::install(&app, &stage.payload(), component.install_target()).await
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
pub fn updater_install_pending(app: AppHandle) -> bool {
	install::install_pending(&app)
}

#[tauri::command]
pub fn updater_installed_version(
	app: AppHandle,
	component: String,
) -> Result<Option<String>, UpdateError> {
	let component = component::by_key(&component)?;
	Ok(install::probe(&app, component).installed_version())
}

#[tauri::command]
pub fn updater_take_install_outcome(
	app: AppHandle,
) -> Option<install::Outcome> {
	install::take_outcome(&app)
}

#[tauri::command]
pub fn updater_open_install_permission_settings(
	app: AppHandle,
) -> Result<(), UpdateError> {
	install::open_install_permission_settings(&app)
}
#[tauri::command]
pub async fn updater_discard(
	app: AppHandle,
	component: String,
) -> Result<(), UpdateError> {
	let component = component::by_key(&component)?;
	let state = app.state::<UpdateState>();
	state.inner().downloads.cancel_and_join(component.key).await;
	state.downloads.forget_retained(component.key);
	state.offer(component.key, None);
	let root = storage::component_root(&app, component)?;
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
				kind: InstallKind::Update,
				can_install_now: false,
			}),
			serde_json::json!({
				"state": "ready",
				"detail": { "tag": "v0.2.0", "version": "0.2.0", "kind": "update", "canInstallNow": false }
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
				kind: InstallKind::Install,
			}),
			serde_json::json!({
				"state": "resumable",
				"detail": { "tag": "v0.2.0", "version": "0.2.0", "kind": "install" }
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
			json(&Capability::Unsupported(
				install::Unsupported::ForeignTarget
			)),
			serde_json::json!({
				"state": "unsupported",
				"detail": { "reason": "foreignTarget" }
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
	fn a_candidate_and_its_progress_both_name_their_component() {
		let candidate = super::super::release::Candidate {
			component: "google-oauth".into(),
			kind: super::super::baseline::InstallKind::Install,
			tag: "v1.1.0".into(),
			version: "1.1.0".into(),
			notes: None,
			published_at: None,
			payload: super::super::release::Artifact {
				name: "open-grind-google-oauth-v1.1.0-arm64-v8a.apk".into(),
				url: "https://git.opengrind.org/a.apk".into(),
				uuid: "u".into(),
				size: 4,
			},
			signature: super::super::release::Artifact {
				name: "open-grind-google-oauth-v1.1.0-arm64-v8a.apk.minisig"
					.into(),
				url: "https://git.opengrind.org/a.apk.minisig".into(),
				uuid: "s".into(),
				size: 228,
			},
		};

		let wire = json(&candidate);
		assert_eq!(wire["component"], "google-oauth");
		assert_eq!(wire["kind"], "install");

		let progress = download::Progress::new(
			&candidate,
			0,
			download::Phase::Downloading,
		);
		assert_eq!(json(&progress)["component"], "google-oauth");
		assert_eq!(
			json(&progress)["kind"],
			"install",
			"a download resumed after a reload must still know it is a first install"
		);
	}

	#[test]
	fn progress_reports_its_phase_as_flat_fields() {
		let progress = Progress {
			component: "google-oauth".into(),
			kind: InstallKind::Update,
			tag: "v0.2.0".into(),
			version: "0.2.0".into(),
			phase: download::Phase::Downloading,
			received: 1024,
			total: 4096,
		};
		assert_eq!(
			json(&progress),
			serde_json::json!({
				"component": "google-oauth",
				"kind": "update",
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
