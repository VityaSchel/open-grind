use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::plugin::mobile::PluginInvokeError;
use tauri::plugin::PluginHandle;
use tauri::{AppHandle, Manager, Wry};

use super::super::error::UpdateError;
use super::{Capability, Outcome, Unsupported};

pub struct AndroidUpdater {
	pub handle: PluginHandle<Wry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapabilityResponse {
	supported: bool,
	reason: Option<String>,
	installer: Option<String>,
	#[serde(default)]
	can_install_now: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallRequest<'a> {
	path: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchRequest {
	on_event: tauri::ipc::Channel<Outcome>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutcomeResponse {
	outcome: Option<Outcome>,
}

fn plugin(app: &AppHandle) -> Result<PluginHandle<Wry>, UpdateError> {
	app.try_state::<AndroidUpdater>()
		.map(|state| state.handle.clone())
		.ok_or_else(|| {
			UpdateError::Install("update plugin is not registered".into())
		})
}

pub fn capability(app: &AppHandle) -> Capability {
	let Ok(handle) = plugin(app) else {
		return Capability::Unsupported(Unsupported::Undetermined);
	};
	let response: CapabilityResponse = match handle
		.run_mobile_plugin("capability", ())
	{
		Ok(response) => response,
		Err(_) => return Capability::Unsupported(Unsupported::Undetermined),
	};

	if response.supported {
		return Capability::Supported {
			payload_suffix: super::release_asset_suffix().unwrap_or_default(),
			can_install_now: response.can_install_now,
		};
	}
	Capability::Unsupported(match response.reason.as_deref() {
		Some("externally-managed") => Unsupported::ExternallyManaged {
			installer: response
				.installer
				.unwrap_or_else(|| "another store".into()),
		},
		Some("foreign-signer") => Unsupported::ForeignSigner,
		_ => Unsupported::Undetermined,
	})
}

pub async fn install(
	app: &AppHandle,
	payload: &Path,
) -> Result<(), UpdateError> {
	let path = payload.to_str().ok_or_else(|| {
		UpdateError::Storage("staged path is not valid UTF-8".into())
	})?;

	plugin(app)?
		.run_mobile_plugin_async::<serde_json::Value>(
			"install",
			InstallRequest { path },
		)
		.await
		.map(|_| ())
		.map_err(map_plugin_error)
}

pub fn hold_process<R: tauri::Runtime>(app: &AppHandle<R>, active: bool) {
	let Some(state) = app.try_state::<AndroidUpdater>() else {
		return;
	};
	let handle = state.handle.clone();
	let command = if active {
		"beginTransfer"
	} else {
		"endTransfer"
	};
	if let Err(e) = handle.run_mobile_plugin::<serde_json::Value>(command, ()) {
		eprintln!("[update] {command} failed: {e}");
	}
}

pub fn sweep_replaced() {}

pub fn enforce_home() {}

pub fn take_outcome(app: &AppHandle) -> Option<Outcome> {
	let response: OutcomeResponse = plugin(app)
		.ok()?
		.run_mobile_plugin("takeOutcome", ())
		.ok()?;
	response.outcome
}

pub fn watch_install(
	app: &AppHandle,
	on_event: tauri::ipc::Channel<Outcome>,
) -> Result<(), UpdateError> {
	plugin(app)?
		.run_mobile_plugin::<serde_json::Value>(
			"watchInstall",
			WatchRequest { on_event },
		)
		.map(|_| ())
		.map_err(map_plugin_error)
}

pub fn open_install_permission_settings(
	app: &AppHandle,
) -> Result<(), UpdateError> {
	plugin(app)?
		.run_mobile_plugin::<serde_json::Value>(
			"openInstallPermissionSettings",
			(),
		)
		.map(|_| ())
		.map_err(map_plugin_error)
}

fn map_plugin_error(error: PluginInvokeError) -> UpdateError {
	let PluginInvokeError::InvokeRejected(response) = &error else {
		return UpdateError::Install(error.to_string());
	};
	match response.message.as_deref() {
		Some("unknown-sources") => UpdateError::NeedsUnknownSources,
		Some("externally-managed") => {
			UpdateError::Unsupported(Unsupported::ExternallyManaged {
				installer: "another store".into(),
			})
		}
		Some("foreign-signer") => {
			UpdateError::Unsupported(Unsupported::ForeignSigner)
		}
		Some("package-mismatch") => UpdateError::Signature(
			"staged package is for a different application".into(),
		),
		Some("downgrade") => UpdateError::Install(
			"staged package is not newer than this one".into(),
		),
		Some("missing") => UpdateError::NothingStaged,
		Some("install-in-progress") => {
			UpdateError::Install("an install is already running".into())
		}
		Some(other) => UpdateError::Install(other.to_owned()),
		None => UpdateError::Install(error.to_string()),
	}
}
