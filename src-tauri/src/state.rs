use std::sync::{Arc, OnceLock};
use tokio::sync::{mpsc, Notify};

use crate::api::client::GrindrClient;
use crate::api::ws::WsCommand;
use crate::error::AppError;

pub struct AppState {
    pub client: OnceLock<GrindrClient>,
    pub ws_tx: mpsc::Sender<WsCommand>,
    pub ws_rx: tokio::sync::Mutex<Option<mpsc::Receiver<WsCommand>>>,
    pub auth_notify: Arc<Notify>,
    pub logout_notify: Arc<Notify>,
}

impl AppState {
    pub fn client(&self) -> Result<&GrindrClient, AppError> {
        self.client.get().ok_or(AppError::NotInitialized)
    }
}
