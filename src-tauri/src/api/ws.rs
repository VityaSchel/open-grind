use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{AppError, BanInfo};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionErrorPayload {
    message: String,
    unauthorized: bool,
}

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
            while let Ok(event) = rx.recv().await {
                let safe_type = event.event_type.replace('.', "_");
                app.emit(&format!("grindr:{safe_type}"), &event.payload).ok();
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
            while let Ok(event) = rx.recv().await {
                match event {
                    grindr::AuthEvent::LoggedOut => {
                        app.emit(
                            "auth:session-error",
                            SessionErrorPayload {
                                message: "Session expired".to_owned(),
                                unauthorized: true,
                            },
                        )
                        .ok();
                    }
                    grindr::AuthEvent::RefreshFailed { message } => {
                        app.emit(
                            "auth:session-error",
                            SessionErrorPayload {
                                message,
                                unauthorized: false,
                            },
                        )
                        .ok();
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
        grindr::WsConnectionState::Connected => app.emit("ws:connected", ()).ok(),
        grindr::WsConnectionState::Disconnected => app.emit("ws:disconnected", ()).ok(),
    };
}

#[tauri::command]
pub async fn ws_connect(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    state.client()?.connect().await;
    Ok(())
}

#[tauri::command]
pub async fn ws_send(
    state: tauri::State<'_, AppState>,
    command: grindr::WsCommand,
) -> Result<(), AppError> {
    state
        .client()?
        .ws_sender()
        .send(command)
        .await
        .map_err(|_| AppError::Http("WS not connected".to_owned()))
}
