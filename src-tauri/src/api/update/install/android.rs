use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::plugin::mobile::PluginInvokeError;
use tauri::plugin::PluginHandle;
use tauri::{AppHandle, Manager, Wry};

use super::super::baseline::{Baseline, InstallKind};
use super::super::component::Component;
use super::super::error::UpdateError;
use super::{Outcome, TransferPurpose, Unsupported};

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
struct CapabilityRequest<'a> {
	package_name: Option<&'a str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallRequest<'a> {
	path: &'a str,
	package_name: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageStateRequest<'a> {
	package_name: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackageStateResponse {
	installed: bool,
	version_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TransferRequest<'a> {
	package_name: Option<&'a str>,
	kind: Option<InstallKind>,
	purpose: Option<&'a str>,
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

#[derive(Deserialize)]
struct InstallPendingResponse {
	pending: bool,
}

fn plugin(app: &AppHandle) -> Result<PluginHandle<Wry>, UpdateError> {
	app.try_state::<AndroidUpdater>()
		.map(|state| state.handle.clone())
		.ok_or_else(|| {
			UpdateError::Install("update plugin is not registered".into())
		})
}

pub fn verdict(
	app: &AppHandle,
	component: &Component,
) -> Result<bool, Unsupported> {
	let handle = plugin(app).map_err(|_| Unsupported::Undetermined)?;
	let response: CapabilityResponse = handle
		.run_mobile_plugin(
			"capability",
			CapabilityRequest {
				package_name: component.package(),
			},
		)
		.map_err(|_| Unsupported::Undetermined)?;

	if response.supported {
		return Ok(response.can_install_now);
	}
	Err(response
		.reason
		.as_deref()
		.and_then(|reason| {
			Unsupported::from_gate_marker(reason, response.installer)
		})
		.unwrap_or(Unsupported::Undetermined))
}

pub async fn install(
	app: &AppHandle,
	payload: &Path,
	package_name: &str,
) -> Result<(), UpdateError> {
	let path = payload.to_str().ok_or_else(|| {
		UpdateError::Storage("staged path is not valid UTF-8".into())
	})?;

	plugin(app)?
		.run_mobile_plugin_async::<serde_json::Value>(
			"install",
			InstallRequest { path, package_name },
		)
		.await
		.map(|_| ())
		.map_err(map_plugin_error)
}

pub fn probe_package(app: &AppHandle, package: &str) -> Baseline {
	let Ok(handle) = plugin(app) else {
		return Baseline::Unreadable {
			why: "update plugin is not registered".to_owned(),
		};
	};
	let response: PackageStateResponse = match handle.run_mobile_plugin(
		"packageState",
		PackageStateRequest {
			package_name: package,
		},
	) {
		Ok(response) => response,
		Err(error) => {
			return Baseline::Unreadable {
				why: error.to_string(),
			}
		}
	};
	if !response.installed {
		return Baseline::Absent;
	}
	match response
		.version_name
		.as_deref()
		.and_then(|name| semver::Version::parse(name).ok())
	{
		Some(version) => Baseline::Installed { version },
		None => Baseline::Opaque {
			name: response.version_name,
		},
	}
}

fn transfer_request(purpose: TransferPurpose) -> TransferRequest<'static> {
	match purpose {
		TransferPurpose::Update { package_name, kind } => TransferRequest {
			package_name: Some(package_name),
			kind: Some(kind),
			purpose: None,
		},
		TransferPurpose::MediaUpload => TransferRequest {
			package_name: None,
			kind: None,
			purpose: Some(super::MEDIA_UPLOAD),
		},
	}
}

fn send_transfer<R: tauri::Runtime>(
	app: &AppHandle<R>,
	command: &str,
	purpose: TransferPurpose,
) {
	let Some(state) = app.try_state::<AndroidUpdater>() else {
		return;
	};
	if let Err(e) = state.handle.run_mobile_plugin::<serde_json::Value>(
		command,
		transfer_request(purpose),
	) {
		tracing::warn!("[transfer] {command} failed: {e}");
	}
}

pub(super) fn begin_transfer<R: tauri::Runtime>(
	app: &AppHandle<R>,
	purpose: TransferPurpose,
) {
	send_transfer(app, "beginTransfer", purpose);
}

pub(super) fn end_transfer<R: tauri::Runtime>(
	app: &AppHandle<R>,
	purpose: TransferPurpose,
) {
	send_transfer(app, "endTransfer", purpose);
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

pub fn install_pending(app: &AppHandle) -> bool {
	plugin(app)
		.ok()
		.and_then(|handle| {
			handle
				.run_mobile_plugin::<InstallPendingResponse>(
					"installPending",
					(),
				)
				.ok()
		})
		.is_some_and(|response| response.pending)
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
	if let Some(unsupported) = response
		.message
		.as_deref()
		.and_then(|marker| Unsupported::from_gate_marker(marker, None))
	{
		return UpdateError::Unsupported(unsupported);
	}
	match response.message.as_deref() {
		Some("unknown-sources") => UpdateError::NeedsUnknownSources,
		Some("package-mismatch") => UpdateError::Signature(
			"staged package is for a different application".into(),
		),
		Some("downgrade") => UpdateError::Install(
			"staged package is not newer than this one".into(),
		),
		Some("unknown-target") => UpdateError::UnknownComponent(
			"the plugin refused that install target".into(),
		),
		Some("missing") => UpdateError::NothingStaged,
		Some("install-in-progress") => {
			UpdateError::Install("an install is already running".into())
		}
		Some(other) => UpdateError::Install(other.to_owned()),
		None => UpdateError::Install(error.to_string()),
	}
}
