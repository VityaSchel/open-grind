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

pub struct SessionRecovery {
	running: AtomicBool,
	pub foreground: AtomicBool,
}

impl Default for SessionRecovery {
	fn default() -> Self {
		Self {
			running: AtomicBool::new(false),
			foreground: AtomicBool::new(true),
		}
	}
}

fn now_unix() -> u64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map(|d| d.as_secs())
		.unwrap_or(0)
}

fn session_of(session: Option<&grindr::Session>) -> CurrentSession {
	match session {
		Some(session) => {
			let expires_at =
				session.token.as_ref().map(|token| token.expires_at);
			CurrentSession {
				profile_id: session
					.credentials
					.profile_id
					.as_ref()
					.and_then(|id| id.parse().ok()),
				expires_at,
				stale: expires_at
					.is_none_or(|at| at < now_unix() + REFRESH_BUFFER_SECS),
			}
		}
		None => CurrentSession::default(),
	}
}

fn still_stale(client: &grindr::GrindrClient) -> bool {
	session_of(client.session_receiver().borrow().as_ref()).stale
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
		match client.refresh_session().await {
			Ok(_) => return Outcome::Quiet,
			Err(error) => {
				let mapped = AppError::from_client_error(error, client);
				if let AppError::Banned(info) = mapped {
					return Outcome::Banned(info);
				}
				if matches!(
					mapped,
					AppError::Unauthorized { .. } | AppError::NotSignedIn
				) {
					return Outcome::Failed(SessionErrorPayload {
						message: mapped.to_string(),
						unauthorized: true,
						kind: mapped.kind().to_owned(),
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
			kind: error.kind().to_owned(),
			attempts,
			transient: true,
		}),
		None => Outcome::Quiet,
	}
}

#[tauri::command]
pub async fn set_app_active(
	state: tauri::State<'_, AppState>,
	recovery: tauri::State<'_, SessionRecovery>,
	active: bool,
) -> Result<(), AppError> {
	recovery.foreground.store(active, Ordering::SeqCst);
	let client = state.client()?;
	let resuming = active && !client.is_active();
	client.set_active(active);
	if resuming {
		client.reset_transport().await?;
	}
	Ok(())
}

#[tauri::command]
pub async fn current_session(
	state: tauri::State<'_, AppState>,
) -> Result<CurrentSession, AppError> {
	let Ok(client) = state.client() else {
		return Ok(CurrentSession::default());
	};
	let session = session_of(client.session_receiver().borrow().as_ref());
	Ok(session)
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentSession {
	pub profile_id: Option<u64>,
	pub expires_at: Option<u64>,
	pub stale: bool,
}

#[cfg(test)]
mod tests {
	use super::*;

	fn session_expiring_at(expires_at: u64) -> grindr::Session {
		grindr::Session {
			credentials: grindr::Credentials {
				email: "a@b.c".to_owned(),
				profile_id: Some("42".to_owned()),
				auth_token: "tok".to_owned(),
				kind: grindr::SessionKind::Email,
				third_party_user_id: None,
			},
			token: Some(grindr::SessionToken {
				session_id: "sid".to_owned(),
				expires_at,
				restriction: None,
			}),
		}
	}

	fn session_awaiting_its_first_token() -> grindr::Session {
		let mut session = session_expiring_at(0);
		session.token = None;
		session
	}

	#[test]
	fn a_session_inside_the_refresh_buffer_reads_as_stale() {
		let fresh = session_of(Some(&session_expiring_at(now_unix() + 3600)));
		assert_eq!(fresh.profile_id, Some(42));
		assert!(!fresh.stale);

		let expiring = session_of(Some(&session_expiring_at(now_unix() + 30)));
		assert!(expiring.stale, "inside the 60s buffer counts as stale");

		assert!(session_of(Some(&session_expiring_at(0))).stale);

		let resumed = session_of(Some(&session_awaiting_its_first_token()));
		assert_eq!(resumed.profile_id, Some(42));
		assert!(resumed.stale, "no token yet means a refresh is owed");
		assert!(resumed.expires_at.is_none());
	}

	#[test]
	fn no_session_has_no_profile_and_owes_no_refresh() {
		let session = session_of(None);
		assert!(session.profile_id.is_none());
		assert!(!session.stale, "a signed-out app owes no refresh");
		assert!(session.expires_at.is_none());
	}

	#[test]
	fn an_unparseable_profile_id_reads_as_signed_out() {
		let mut stored = session_expiring_at(now_unix() + 3600);
		stored.credentials.profile_id = Some("not-a-number".to_owned());
		assert!(session_of(Some(&stored)).profile_id.is_none());
	}

	#[test]
	fn the_session_serializes_in_the_shape_the_frontend_parses() {
		let json =
			serde_json::to_value(session_of(Some(&session_expiring_at(42))))
				.unwrap();
		assert_eq!(json["profileId"], 42);
		assert_eq!(json["expiresAt"], 42);
		assert_eq!(json["stale"], true);

		let signed_out = serde_json::to_value(session_of(None)).unwrap();
		assert!(signed_out["profileId"].is_null());
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
}
