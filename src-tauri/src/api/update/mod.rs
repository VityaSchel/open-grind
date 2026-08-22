mod client;
pub mod commands;
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

use std::sync::Mutex;

use semver::Version;
use tauri::{AppHandle, Emitter, Manager, Wry};

pub use download::Progress;
pub use error::UpdateError;
pub use install::enforce_home;

use release::Candidate;

#[derive(Default)]
pub struct UpdateState {
	downloads: download::Downloads,
	latest: Mutex<Option<Candidate>>,
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
				if let (Ok(root), Ok(current)) =
					(storage::root(&app), current_version(&app))
				{
					storage::purge(&root, &current, None);
				}
			});
			Ok(())
		})
		.build()
}

const INSTALL_EVENT: &str = "update:install";

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
) -> Result<Version, UpdateError> {
	Ok(app.package_info().version.clone())
}
