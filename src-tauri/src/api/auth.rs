use serde::Serialize;

use crate::error::AppError;
use crate::state::AppState;

use super::client::GrindrClient;
use super::google_oauth;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub enum SessionKind {
    Email,
    Google,
}

impl Default for SessionKind {
    fn default() -> Self {
        SessionKind::Email
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Session {
    pub email: String,
    pub expires_at: u64,
    pub profile_id: String,
    pub session_id: String,
    pub auth_token: String,
    #[serde(default)]
    pub kind: SessionKind,
    #[serde(default)]
    pub third_party_user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResponse {
    pub profile_id: String,
    pub session_id: String,
    pub auth_token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
    pub token: Option<String>,
    pub geohash: Option<String>,
}

trait AuthRequest: Serialize {
    fn email(&self) -> &str;
}

impl AuthRequest for LoginRequest {
    fn email(&self) -> &str {
        &self.email
    }
}

impl AuthRequest for RefreshRequest {
    fn email(&self) -> &str {
        &self.email
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshRequest {
    pub email: String,
    pub auth_token: String,
    pub token: Option<String>,
    pub geohash: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
    pub profile_id: String,
}

#[derive(Debug, Deserialize)]
struct JwtClaims {
    exp: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThirdPartySignInRequest<'a> {
    third_party_vendor: u8,
    third_party_token: &'a str,
    geohash: Option<&'a str>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThirdPartyAuthResponse {
    #[allow(dead_code)]
    registered: bool,
    authentication_response: Option<AuthenticationResponse>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthenticationResponse {
    profile_id: String,
    session_id: String,
    auth_token: String,
    third_party_user_id: String,
    #[serde(default)]
    third_party_user_id_to_show: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AssignmentsResponse {
    #[serde(default)]
    assignments: Vec<Assignment>,
}

#[derive(Debug, Deserialize)]
struct Assignment {
    key: String,
    value: String,
}

impl LoginRequest {
    pub fn new(email: String, password: String) -> Self {
        Self {
            email,
            password,
            token: None,
            geohash: None,
        }
    }
}

impl RefreshRequest {
    pub fn new(email: String, auth_token: String) -> Self {
        Self {
            email,
            auth_token,
            token: None,
            geohash: None,
        }
    }
}

fn decode_session_jwt(token: &str) -> Result<JwtClaims, AppError> {
    let data = jsonwebtoken::dangerous::insecure_decode::<JwtClaims>(token)
        .map_err(|e| AppError::Auth(format!("JWT decode failed: {e}")))?;

    Ok(data.claims)
}

pub struct AuthStorage;

impl AuthStorage {
    fn get_session_entry() -> Result<Entry, AppError> {
        Entry::new("open-grind", "session").map_err(|e| AppError::Auth(e.to_string()))
    }
    pub fn get_session() -> Result<Option<Session>, AppError> {
        let entry = Self::get_session_entry()?;
        let session_bytes = match entry.get_secret() {
            Ok(bytes) => bytes,
            Err(keyring_core::Error::NoEntry) => return Ok(None),
            Err(e) => return Err(AppError::Auth(e.to_string())),
        };
        rmp_serde::decode::from_slice(&session_bytes)
            .map_err(|e| AppError::Auth(e.to_string()))
            .map(Some)
    }
    pub fn set_session(session: &Session) -> Result<(), AppError> {
        let session_bytes = rmp_serde::encode::to_vec(session)
            .map_err(|e| AppError::Auth(format!("session encode failed: {e}")))?;
        Self::get_session_entry()?
            .set_secret(&session_bytes)
            .map_err(|e| AppError::Auth(e.to_string()))
    }

    pub fn delete_session() {
        match Self::get_session_entry() {
            Ok(entry) => match entry.delete_credential() {
                Ok(()) | Err(keyring_core::Error::NoEntry) => {}
                Err(e) => eprintln!("[auth] failed to delete keyring session: {e}"),
            },
            Err(e) => eprintln!("[auth] failed to open keyring entry for deletion: {e}"),
        }
    }
}

impl GrindrClient {
    async fn create_session(&self, body: &impl AuthRequest) -> Result<Session, AppError> {
        let session_resp: SessionResponse = self
            .request_json(wreq::Method::POST, "/v8/sessions", Some(body))
            .await?;
        let claims = decode_session_jwt(&session_resp.session_id)?;

        let session = Session {
            email: body.email().to_owned(),
            profile_id: session_resp.profile_id.clone(),
            session_id: session_resp.session_id,
            auth_token: session_resp.auth_token,
            expires_at: claims.exp,
            kind: SessionKind::Email,
            third_party_user_id: None,
        };

        AuthStorage::set_session(&session)?;

        Ok(session)
    }

    pub async fn google_sign_in(&self, google_access_token: &str) -> Result<LoginResult, AppError> {
        let body = ThirdPartySignInRequest {
            third_party_vendor: 2,
            third_party_token: google_access_token,
            geohash: None,
        };

        let parsed: ThirdPartyAuthResponse = self
            .request_json(wreq::Method::POST, "/v8/sessions/thirdparty", Some(&body))
            .await?;
        let auth = parsed.authentication_response.ok_or_else(|| {
            AppError::Auth(
                "Account is not registered with Grindr. Sign up in the official app first."
                    .to_owned(),
            )
        })?;

        let claims = decode_session_jwt(&auth.session_id)?;
        let display_email = auth
            .third_party_user_id_to_show
            .clone()
            .unwrap_or_else(|| auth.third_party_user_id.clone());

        let session = Session {
            email: display_email,
            profile_id: auth.profile_id.clone(),
            session_id: auth.session_id,
            auth_token: auth.auth_token,
            expires_at: claims.exp,
            kind: SessionKind::Google,
            third_party_user_id: Some(auth.third_party_user_id),
        };

        AuthStorage::set_session(&session)?;
        let profile_id = session.profile_id.clone();
        *self.session.write().await = Some(session);

        Ok(LoginResult { profile_id })
    }

    pub async fn login(&self, email: &str, password: &str) -> Result<LoginResult, AppError> {
        let body = LoginRequest::new(email.to_owned(), password.to_owned());
        let session = self.create_session(&body).await?;
        let profile_id = session.profile_id.clone();

        *self.session.write().await = Some(session);

        Ok(LoginResult { profile_id })
    }

    pub async fn refresh_token(&self) -> Result<LoginResult, AppError> {
        let current = self.session.read().await;
        let session = current
            .as_ref()
            .ok_or_else(|| AppError::Auth("Not logged in".to_owned()))?;

        let body = RefreshRequest::new(session.email.clone(), session.auth_token.clone());

        drop(current);

        let session = self.create_session(&body).await?;
        let profile_id = session.profile_id.clone();
        *self.session.write().await = Some(session);

        Ok(LoginResult { profile_id })
    }

    pub async fn recaptcha_first_party_enabled(&self) -> Result<bool, AppError> {
        let resp: AssignmentsResponse = self
            .request_json::<(), AssignmentsResponse>(
                wreq::Method::GET,
                "/public/v1/assignments",
                None,
            )
            .await?;

        Ok(resp
            .assignments
            .iter()
            .any(|a| a.key == "recaptcha_first_party" && a.value == "on"))
    }

    pub async fn authorization_header(&self) -> Option<String> {
        let expires_at = match self.session.read().await.as_ref() {
            Some(s) => s.expires_at,
            None => return None,
        };

        if expires_at < (chrono::Utc::now().timestamp() as u64 + 60) {
            let _guard = self.refresh_lock.lock().await;

            let still_expired = match self.session.read().await.as_ref() {
                Some(s) => s.expires_at < (chrono::Utc::now().timestamp() as u64 + 60),
                None => return None,
            };

            if still_expired {
                if let Err(e) = self.refresh_token().await {
                    self.handle_refresh_error(&e).await;
                }
            }
        }

        self.session
            .read()
            .await
            .as_ref()
            .map(|s| format!("Grindr3 {}", s.session_id))
    }

    pub(super) async fn handle_refresh_error(&self, error: &AppError) {
        eprintln!("[auth] token refresh failed: {error}");

        let unauthorized = matches!(error, AppError::Unauthorized { .. });
        if unauthorized {
            self.clear_session().await;
        } else if self.session.read().await.is_none() {
            return;
        }

        self.emit(
            "auth:session-error",
            SessionErrorPayload {
                message: error.to_string(),
                unauthorized,
            },
        );
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionErrorPayload {
    message: String,
    unauthorized: bool,
}

#[tauri::command]
pub async fn login(
    state: tauri::State<'_, AppState>,
    email: String,
    password: String,
) -> Result<LoginResult, AppError> {
    let result = state.client()?.login(&email, &password).await?;
    state.auth_notify.notify_one();
    Ok(result)
}

#[tauri::command]
pub async fn login_with_google(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<LoginResult, AppError> {
    let access_token = google_oauth::fetch_google_access_token(&app).await?;
    let result = state.client()?.google_sign_in(&access_token).await?;
    state.auth_notify.notify_one();
    Ok(result)
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
