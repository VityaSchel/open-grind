use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Notify;
use tokio::time::sleep;
use wreq::websocket::{Message, WebSocket};

use crate::error::AppError;
use crate::state::AppState;

use super::headers::GrindrHeaders;

const WS_URL: &str = "wss://grindr.mobi/v1/ws";

#[derive(Debug, Deserialize, Serialize)]
pub struct WsCommand {
    pub r#type: String,
    pub ref_id: String,
    pub payload: Value,
}

pub fn spawn_ws_task(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        run_ws_loop(app).await;
    });
}

async fn run_ws_loop(app: AppHandle) {
    let state = app.state::<AppState>();
    let mut backoff = Duration::from_secs(1);

    loop {
        state.auth_notify.notified().await;

        match connect_and_run(&app).await {
            Ok(()) => {
                break;
            }
            Err(e @ (AppError::NotInitialized | AppError::Auth(_))) => {
                eprintln!("[ws] auth error, waiting for login: {e}");
                app.emit("ws:disconnected", ()).ok();
                backoff = Duration::from_secs(1);
            }
            Err(e) => {
                eprintln!("[ws] error: {e}");
                app.emit("ws:disconnected", ()).ok();
                state.auth_notify.notify_one();
                sleep(backoff).await;
                backoff = (backoff * 2).min(Duration::from_secs(30));
            }
        }
    }
}

async fn connect_and_run(app: &AppHandle) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    let client = state.client()?;

    let authorization = client
        .authorization_header()
        .await
        .ok_or_else(|| AppError::Auth("Not logged in".to_owned()))?;

    let session_id = client
        .session
        .read()
        .await
        .as_ref()
        .map(|s| s.session_id.clone())
        .ok_or_else(|| AppError::Auth("Not logged in".to_owned()))?;

    let fp = client.fingerprint().await;
    let headers = GrindrHeaders::build(
        &fp.device,
        &fp.user_agent,
        Some(&authorization),
        Some("[FREE]"),
    )?;

    let mut builder = fp.ws_http.websocket(WS_URL);
    for (name, value) in &headers.items {
        builder = builder.header(name.clone(), value.clone());
    }

    let response = builder
        .send()
        .await
        .map_err(|e| AppError::Http(format!("WS connect failed: {e}")))?;

    let mut ws = response
        .into_websocket()
        .await
        .map_err(|e| AppError::Http(format!("WS upgrade failed: {e}")))?;

    app.emit("ws:connected", ()).ok();

    let mut cmd_rx = state
        .ws_rx
        .lock()
        .await
        .take()
        .ok_or_else(|| AppError::Http("WS already running".to_owned()))?;

    let result =
        run_message_loop(&mut ws, &mut cmd_rx, &session_id, app, &state.logout_notify).await;

    *state.ws_rx.lock().await = Some(cmd_rx);

    result
}

async fn run_message_loop(
    ws: &mut WebSocket,
    cmd_rx: &mut tokio::sync::mpsc::Receiver<WsCommand>,
    session_id: &str,
    app: &AppHandle,
    logout_notify: &Notify,
) -> Result<(), AppError> {
    let logged_out = logout_notify.notified();
    tokio::pin!(logged_out);

    loop {
        tokio::select! {
            _ = &mut logged_out => {
                return Err(AppError::Auth("logged out".to_owned()));
            }
            msg = ws.next() => match msg {
                Some(Ok(Message::Text(text))) => {
                    if let Ok(val) = serde_json::from_str::<Value>(text.as_str()) {
                        if let Some(event_type) = val["type"].as_str() {
                            let safe_type = event_type.replace('.', "_");
                            app.emit(&format!("grindr:{safe_type}"), &val).ok();
                        }
                    }
                }
                Some(Ok(Message::Ping(data))) => {
                    ws.send(Message::Pong(data)).await
                        .map_err(|e| AppError::Http(e.to_string()))?;
                }
                Some(Ok(Message::Close(_))) | None => {
                    return Err(AppError::Http("WS connection closed by server".to_owned()));
                }
                Some(Err(e)) => {
                    return Err(AppError::Http(e.to_string()));
                }
                Some(Ok(_)) => {}
            },

            cmd = cmd_rx.recv() => match cmd {
                Some(cmd) => {
                    let json = serde_json::json!({
                        "type": cmd.r#type,
                        "ref": cmd.ref_id,
                        "token": session_id,
                        "payload": cmd.payload,
                    });
                    ws.send(Message::text(json.to_string()))
                        .await
                        .map_err(|e| AppError::Http(e.to_string()))?;
                }
                None => return Ok(()),
            }
        }
    }
}

#[tauri::command]
pub async fn ws_connect(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    let has_session = match state.client() {
        Ok(c) => c.session.read().await.is_some(),
        Err(_) => false,
    };

    if has_session {
        state.auth_notify.notify_one();
    }
    Ok(())
}

#[tauri::command]
pub async fn ws_send(
    state: tauri::State<'_, AppState>,
    command: WsCommand,
) -> Result<(), AppError> {
    let client = state.client()?;
    if client.session.read().await.is_none() {
        return Err(AppError::Auth("Not logged in".to_owned()));
    }

    state
        .ws_tx
        .send(command)
        .await
        .map_err(|_| AppError::Http("WS not connected".to_owned()))
}
