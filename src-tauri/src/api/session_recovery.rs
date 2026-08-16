use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{AppError, BanInfo};
use crate::state::AppState;

const COALESCE: Duration = Duration::from_millis(1500);

const ATTEMPT_DELAYS: [Duration; 3] = [
	Duration::ZERO,
	Duration::from_secs(4),
	Duration::from_secs(12),
];

const REFRESH_BUFFER_SECS: u64 = 60;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionErrorPayload {
	pub message: String,
	pub unauthorized: bool,
	pub kind: String,
	pub attempts: u32,
	pub transient: bool,
}

#[derive(Default)]
pub struct SessionRecovery {
	running: AtomicBool,
}

fn now_unix() -> u64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map(|d| d.as_secs())
		.unwrap_or(0)
}

fn error_kind(error: &AppError) -> String {
	serde_json::to_value(error)
		.ok()
		.and_then(|value| value["kind"].as_str().map(str::to_owned))
		.unwrap_or_else(|| "Http".to_owned())
}

fn health_of(session: Option<&grindr::Session>) -> SessionHealth {
	match session {
		Some(session) => SessionHealth {
			signed_in: true,
			expires_at: Some(session.expires_at),
			stale: session.expires_at < now_unix() + REFRESH_BUFFER_SECS,
		},
		None => SessionHealth::default(),
	}
}

fn still_stale(client: &grindr::GrindrClient) -> bool {
	health_of(client.session_receiver().borrow().as_ref()).stale
}

pub fn report_refresh_failure(
	app: &AppHandle,
	message: String,
	transient: bool,
) {
	let Ok(client) = app.state::<AppState>().client().cloned() else {
		return;
	};

	if !transient {
		app.emit(
			"auth:session-error",
			SessionErrorPayload {
				message,
				unauthorized: false,
				kind: "Auth".to_owned(),
				attempts: 0,
				transient: false,
			},
		)
		.ok();
		return;
	}

	if app
		.state::<SessionRecovery>()
		.running
		.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
		.is_err()
	{
		return;
	}

	let app = app.clone();
	tauri::async_runtime::spawn(async move {
		let outcome = supervise(&client).await;
		app.state::<SessionRecovery>()
			.running
			.store(false, Ordering::SeqCst);
		match outcome {
			Outcome::Quiet => {}
			Outcome::Failed(payload) => {
				app.emit("auth:session-error", payload).ok();
			}
			Outcome::Banned(info) => {
				app.emit("auth:banned", info).ok();
			}
		}
	});
}

enum Outcome {
	Quiet,
	Failed(SessionErrorPayload),
	Banned(BanInfo),
}

async fn supervise(client: &grindr::GrindrClient) -> Outcome {
	tokio::time::sleep(COALESCE).await;

	let mut attempts = 0;
	let mut last: Option<AppError> = None;

	for delay in ATTEMPT_DELAYS {
		tokio::time::sleep(delay).await;

		if !client.is_active() || !still_stale(client) {
			return Outcome::Quiet;
		}

		attempts += 1;
		match client.refresh_token().await {
			Ok(_) => return Outcome::Quiet,
			Err(error) => {
				let mapped = AppError::from_client_error(error, client);
				if let AppError::Banned(info) = mapped {
					return Outcome::Banned(info);
				}
				if matches!(
					mapped,
					AppError::Unauthorized { .. } | AppError::NotLoggedIn
				) {
					return Outcome::Failed(SessionErrorPayload {
						message: mapped.to_string(),
						unauthorized: true,
						kind: error_kind(&mapped),
						attempts,
						transient: false,
					});
				}
				last = Some(mapped);
			}
		}
	}

	match last {
		Some(error) => Outcome::Failed(SessionErrorPayload {
			message: error.to_string(),
			unauthorized: false,
			kind: error_kind(&error),
			attempts,
			transient: true,
		}),
		None => Outcome::Quiet,
	}
}

#[tauri::command]
pub async fn set_app_active(
	state: tauri::State<'_, AppState>,
	active: bool,
) -> Result<(), AppError> {
	let client = state.client()?;
	let resuming = active && !client.is_active();
	client.set_active(active);
	if resuming {
		client.reset_transport().await?;
	}
	Ok(())
}

#[tauri::command]
pub async fn session_health(
	state: tauri::State<'_, AppState>,
) -> Result<SessionHealth, AppError> {
	let Ok(client) = state.client() else {
		return Ok(SessionHealth::default());
	};
	let health = health_of(client.session_receiver().borrow().as_ref());
	Ok(health)
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHealth {
	pub signed_in: bool,
	pub expires_at: Option<u64>,
	pub stale: bool,
}

#[cfg(test)]
mod tests {
	use super::*;

	fn session_expiring_at(expires_at: u64) -> grindr::Session {
		let mut session = grindr::Session::from_auth_token("a@b.c", "tok");
		session.expires_at = expires_at;
		session
	}

	#[test]
	fn a_session_inside_the_refresh_buffer_reads_as_stale() {
		let fresh = health_of(Some(&session_expiring_at(now_unix() + 3600)));
		assert!(fresh.signed_in);
		assert!(!fresh.stale);

		let expiring = health_of(Some(&session_expiring_at(now_unix() + 30)));
		assert!(expiring.stale, "inside the 60s buffer counts as stale");

		assert!(health_of(Some(&session_expiring_at(0))).stale);
	}

	#[test]
	fn no_session_is_neither_signed_in_nor_stale() {
		let health = health_of(None);
		assert!(!health.signed_in);
		assert!(!health.stale, "a signed-out app owes no refresh");
		assert!(health.expires_at.is_none());
	}

	#[test]
	fn health_serializes_in_the_shape_the_frontend_parses() {
		let json =
			serde_json::to_value(health_of(Some(&session_expiring_at(42))))
				.unwrap();
		assert_eq!(json["signedIn"], true);
		assert_eq!(json["expiresAt"], 42);
		assert_eq!(json["stale"], true);
	}

	#[test]
	fn the_error_payload_serializes_in_the_shape_the_frontend_parses() {
		let json = serde_json::to_value(SessionErrorPayload {
			message: "connection reset".to_owned(),
			unauthorized: false,
			kind: "Http".to_owned(),
			attempts: 3,
			transient: true,
		})
		.unwrap();
		assert_eq!(json["message"], "connection reset");
		assert_eq!(json["unauthorized"], false);
		assert_eq!(json["kind"], "Http");
		assert_eq!(json["attempts"], 3);
		assert_eq!(json["transient"], true);
	}

	#[test]
	fn error_kind_matches_the_serde_tag_used_by_api_errors() {
		assert_eq!(error_kind(&AppError::RateLimited), "RateLimited");
		assert_eq!(error_kind(&AppError::RequestBlocked), "RequestBlocked");
		assert_eq!(error_kind(&AppError::Http("x".to_owned())), "Http");
		assert_eq!(
			error_kind(&AppError::Unauthorized {
				code: 401,
				message: "no".to_owned()
			}),
			"Unauthorized"
		);
	}
}
