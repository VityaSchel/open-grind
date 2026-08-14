use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::broadcast::error::RecvError;

use crate::api::session_recovery::{
	report_refresh_failure, SessionErrorPayload,
};
use crate::error::{AppError, BanInfo};
use crate::state::AppState;

pub fn spawn_ws_task(app: AppHandle) {
	{
		let app = app.clone();
		tauri::async_runtime::spawn(async move {
			let client = {
				let state = app.state::<AppState>();
				let Ok(c) = state.client() else { return };
				c.clone()
			};
			let mut rx = client.ws_receiver();
			loop {
				match rx.recv().await {
					Ok(event) => {
						let safe_type = event.event_type.replace('.', "_");
						app.emit(
							&format!("grindr:{safe_type}"),
							&event.payload,
						)
						.ok();
					}
					Err(RecvError::Lagged(skipped)) => {
						app.emit("ws:events-dropped", skipped).ok();
					}
					Err(RecvError::Closed) => break,
				}
			}
		});
	}

	{
		let app = app.clone();
		tauri::async_runtime::spawn(async move {
			let client = {
				let state = app.state::<AppState>();
				let Ok(c) = state.client() else { return };
				c.clone()
			};
			let mut rx = client.connection_state();
			emit_ws_state(&app, &rx.borrow());
			loop {
				if rx.changed().await.is_err() {
					break;
				}
				emit_ws_state(&app, &rx.borrow());
			}
		});
	}

	{
		let app = app.clone();
		tauri::async_runtime::spawn(async move {
			let client = {
				let state = app.state::<AppState>();
				let Ok(c) = state.client() else { return };
				c.clone()
			};
			let mut rx = client.auth_event_receiver();
			loop {
				let event = match rx.recv().await {
					Ok(event) => event,
					// Terminal auth events clear the session before they are
					// sent, so nothing follows one and a lag can never evict it.
					Err(RecvError::Lagged(_)) => continue,
					Err(RecvError::Closed) => break,
				};
				match event {
					grindr::AuthEvent::LoggedOut => {
						app.emit(
							"auth:session-error",
							SessionErrorPayload {
								message: "Session expired".to_owned(),
								unauthorized: true,
								kind: "Unauthorized".to_owned(),
								attempts: 0,
								transient: false,
							},
						)
						.ok();
					}
					grindr::AuthEvent::RefreshFailed {
						message, kind, ..
					} => {
						report_refresh_failure(
							&app,
							message,
							kind.is_transient(),
						);
					}
					grindr::AuthEvent::RefreshRecovered => {
						app.emit("auth:session-ok", ()).ok();
					}
					grindr::AuthEvent::Banned(info) => {
						app.emit("auth:banned", BanInfo::from(info)).ok();
					}
					_ => {}
				}
			}
		});
	}
}

fn emit_ws_state(app: &AppHandle, state: &grindr::WsConnectionState) {
	match state {
		grindr::WsConnectionState::Connected => {
			app.emit("ws:connected", ()).ok()
		}
		grindr::WsConnectionState::Disconnected => {
			app.emit("ws:disconnected", ()).ok()
		}
	};
}

#[tauri::command]
pub async fn ws_connect(
	state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
	state.client()?.connect().await;
	Ok(())
}

#[tauri::command]
pub async fn ws_send(
	state: tauri::State<'_, AppState>,
	command: grindr::WsCommand,
) -> Result<(), AppError> {
	let client = state.client()?;

	// The ws task holds the command receiver while it backs off, so a send only
	// errors once the client is gone: without this gate a command sent while
	// the socket is down buffers and lands on the next reconnect.
	if *client.connection_state().borrow()
		!= grindr::WsConnectionState::Connected
	{
		return Err(AppError::Http("WS not connected".to_owned()));
	}

	// `try_send`, so a backed-up buffer fails instead of parking the caller.
	client
		.ws_sender()
		.try_send(command)
		.map_err(|e| AppError::Http(format!("WS send failed: {e}")))
}

#[cfg(test)]
mod tests {
	use std::sync::OnceLock;

	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

	use super::*;

	fn app_with_a_disconnected_client() -> tauri::App<MockRuntime> {
		let client =
			grindr::GrindrClient::new(grindr::DeviceInfo::generate(), None)
				.expect("client");
		let state = AppState {
			client: OnceLock::new(),
		};
		assert!(state.client.set(client).is_ok());

		mock_builder()
			.manage(state)
			.build(mock_context(noop_assets()))
			.expect("mock app")
	}

	#[tokio::test]
	async fn a_command_sent_while_disconnected_fails_without_queueing() {
		let app = app_with_a_disconnected_client();
		let sender = app.state::<AppState>().client().unwrap().ws_sender();
		let free_before = sender.capacity();

		let result = ws_send(
			app.state::<AppState>(),
			grindr::WsCommand {
				r#type: "chat.v1.message.send".to_owned(),
				ref_id: "ref-1".to_owned(),
				payload: serde_json::json!({}),
			},
		)
		.await;

		assert!(matches!(result, Err(AppError::Http(_))));
		assert_eq!(sender.capacity(), free_before);
	}
}
