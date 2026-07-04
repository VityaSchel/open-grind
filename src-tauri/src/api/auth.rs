use serde::Serialize;

use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
    pub profile_id: String,
}

impl From<grindr::LoginResult> for LoginResult {
    fn from(r: grindr::LoginResult) -> Self {
        Self {
            profile_id: r.profile_id,
        }
    }
}

#[tauri::command]
pub async fn login(
    state: tauri::State<'_, AppState>,
    email: String,
    password: String,
) -> Result<LoginResult, AppError> {
    let result = state.client()?.login(&email, &password).await?;
    Ok(LoginResult::from(result))
}

#[tauri::command]
pub async fn login_with_google(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<LoginResult, AppError> {
    let access_token = super::google_oauth::fetch_google_access_token(&app).await?;
    let result = state.client()?.google_sign_in(&access_token).await?;
    Ok(LoginResult::from(result))
}

#[tauri::command]
pub async fn google_sign_in(
    state: tauri::State<'_, AppState>,
    token: String,
) -> Result<LoginResult, AppError> {
    let result = state.client()?.google_sign_in(&token).await?;
    Ok(LoginResult::from(result))
}

#[tauri::command]
pub async fn refresh_token(state: tauri::State<'_, AppState>) -> Result<LoginResult, AppError> {
    let result = state.client()?.refresh_token().await?;
    Ok(LoginResult::from(result))
}

#[tauri::command]
pub async fn logout(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    state.client()?.logout().await;
    Ok(())
}

#[tauri::command]
pub async fn recaptcha_first_party_enabled(
    state: tauri::State<'_, AppState>,
) -> Result<bool, AppError> {
    state
        .client()?
        .recaptcha_first_party_enabled()
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn auth_state(state: tauri::State<'_, AppState>) -> Result<Option<u64>, AppError> {
    let Ok(client) = state.client() else {
        return Ok(None);
    };
    Ok(client
        .session_receiver()
        .borrow()
        .as_ref()
        .and_then(|s| s.profile_id.parse::<u64>().ok()))
}
