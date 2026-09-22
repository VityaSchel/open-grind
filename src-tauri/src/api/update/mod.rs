mod baseline;
mod client;
pub mod commands;
mod component;
mod dev;
mod download;
mod error;
mod install;
#[cfg(test)]
mod live;
mod release;
mod schedule;
mod session;
mod storage;
mod verify;

use std::collections::BTreeMap;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, Wry};

pub use download::Progress;
pub use error::UpdateError;
pub use install::{enforce_home, TransferHold};

use baseline::{Baseline, InstallKind};
use release::Candidate;

#[derive(Default)]
pub struct UpdateState {
	downloads: download::Downloads,
	latest: Mutex<BTreeMap<String, Candidate>>,
}

impl UpdateState {
	fn offer(&self, component: &str, candidate: Option<Candidate>) {
		let mut latest = self.latest.lock().unwrap();
		match candidate {
			Some(candidate) => latest.insert(component.to_owned(), candidate),
			None => latest.remove(component),
		};
	}

	fn offered(&self, component: &str) -> Option<Candidate> {
		self.latest.lock().unwrap().get(component).cloned()
	}

	fn reusable(
		&self,
		component: &str,
		baseline: &Baseline,
	) -> Option<Candidate> {
		let fits = |candidate: &Candidate| candidate.fits(baseline);
		self.offered(component).filter(fits).or_else(|| {
			self.downloads.retained_candidate(component).filter(fits)
		})
	}

	fn withdraw_updates(&self, component: &str) {
		self.latest.lock().unwrap().retain(|key, candidate| {
			key != component || candidate.kind != InstallKind::Update
		});
		self.downloads.forget_retained_update(component);
	}
}

pub fn plugin() -> tauri::plugin::TauriPlugin<Wry> {
	tauri::plugin::Builder::new("open-grind-update")
		.setup(|app, _api| {
			#[cfg(target_os = "android")]
			{
				let handle = _api.register_android_plugin(
					"org.opengrind.update",
					"UpdatePlugin",
				)?;
				app.manage(install::AndroidUpdater { handle });
			}
			app.manage(UpdateState::default());
			watch_installs(app);

			let app = app.clone();
			tauri::async_runtime::spawn_blocking(move || {
				install::sweep_replaced();
				if let Ok(root) = storage::root(&app) {
					storage::sweep_foreign(&root);
				}
				for component in component::ALL {
					let Ok(root) = storage::component_root(&app, component)
					else {
						continue;
					};
					storage::purge(
						component,
						&root,
						&install::probe(&app, component),
						None,
					);
				}
			});
			Ok(())
		})
		.build()
}

const INSTALL_EVENT: &str = "updater:install";

fn watch_installs(app: &AppHandle) {
	let sink = app.clone();
	let channel = tauri::ipc::Channel::new(move |body| {
		if let Ok(outcome) =
			serde_json::from_value::<install::Outcome>(body.deserialize()?)
		{
			let _ = sink.emit(INSTALL_EVENT, &outcome);
		}
		Ok(())
	});
	if let Err(error) = install::watch_install(app, channel) {
		tracing::warn!("[update] install events unavailable: {error}");
	}
}

fn current_version<R: tauri::Runtime>(
	app: &AppHandle<R>,
) -> baseline::HostVersion {
	baseline::HostVersion::of(app.package_info().version.clone())
}

#[cfg(test)]
mod tests {
	use super::release::Artifact;
	use super::*;

	fn offer_of(kind: InstallKind) -> Candidate {
		Candidate {
			component: component::GOOGLE_OAUTH.key.into(),
			kind,
			tag: "v1.1.0".into(),
			version: "1.1.0".into(),
			notes: None,
			published_at: None,
			payload: Artifact {
				name: "open-grind-google-oauth-v1.1.0-arm64-v8a.apk".into(),
				url: format!("{}a.apk", client::origin()),
				uuid: "uuid".into(),
				size: 4,
			},
			signature: Artifact {
				name: "open-grind-google-oauth-v1.1.0-arm64-v8a.apk.minisig"
					.into(),
				url: format!("{}a.apk.minisig", client::origin()),
				uuid: "sig".into(),
				size: 228,
			},
		}
	}

	#[test]
	fn an_unattended_tick_keeps_a_first_install_the_user_asked_for() {
		let state = UpdateState::default();
		let key = component::GOOGLE_OAUTH.key;
		state.offer(key, Some(offer_of(InstallKind::Install)));

		state.withdraw_updates(key);

		assert_eq!(state.offered(key), Some(offer_of(InstallKind::Install)));
	}

	#[test]
	fn an_update_for_a_removed_target_is_withdrawn() {
		let state = UpdateState::default();
		let key = component::GOOGLE_OAUTH.key;
		state.offer(component::APP.key, Some(offer_of(InstallKind::Update)));
		state.offer(key, Some(offer_of(InstallKind::Update)));

		state.withdraw_updates(key);

		assert_eq!(state.offered(key), None);
		assert!(
			state.offered(component::APP.key).is_some(),
			"another component's offer is not this target's to withdraw"
		);
	}

	fn older() -> Baseline {
		Baseline::of_version(semver::Version::new(1, 0, 0))
	}

	#[test]
	fn an_update_offered_before_the_target_was_removed_is_not_reused() {
		let state = UpdateState::default();
		let key = component::GOOGLE_OAUTH.key;
		state.offer(key, Some(offer_of(InstallKind::Update)));

		assert_eq!(state.reusable(key, &Baseline::Absent), None);
		assert_eq!(
			state.reusable(key, &older()),
			Some(offer_of(InstallKind::Update))
		);
	}

	#[test]
	fn a_held_update_for_a_removed_target_is_not_reused() {
		let root = std::env::temp_dir()
			.join(format!("og-reusable-{}", std::process::id()));
		let _ = std::fs::remove_dir_all(&root);
		let stage = storage::stage(&root, "v1.1.0").unwrap();
		stage.create().unwrap();
		std::fs::write(stage.part(), b"half").unwrap();
		let state = UpdateState::default();
		let key = component::GOOGLE_OAUTH.key;
		state
			.downloads
			.hold(
				&stage,
				&storage::Staged::new(&offer_of(InstallKind::Update)),
			)
			.unwrap();

		assert_eq!(state.reusable(key, &Baseline::Absent), None);
		assert!(state.reusable(key, &older()).is_some());
		let _ = std::fs::remove_dir_all(root);
	}
}
