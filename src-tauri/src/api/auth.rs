use serde::Serialize;

use crate::error::AppError;
use crate::media::MediaProxy;
use crate::state::AppState;
use crate::storage::{AuthStorage, DeviceStorage, SigningKeyStorage};

static SIGN_OUT: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInResult {
	pub profile_id: String,
	pub restriction: Option<Restriction>,
}

impl From<grindr::SignInResult> for SignInResult {
	fn from(r: grindr::SignInResult) -> Self {
		Self {
			profile_id: r.profile_id,
			restriction: r.restriction.map(Restriction::from),
		}
	}
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Restriction {
	pub kind: String,
	pub region: Option<String>,
	pub reason: Option<String>,
}

impl From<grindr::Restriction> for Restriction {
	fn from(r: grindr::Restriction) -> Self {
		match r {
			grindr::Restriction::AgeVerification { region, reason } => Self {
				kind: "ageVerification".to_owned(),
				region: Some(region_str(region).to_owned()),
				reason: Some(reason),
			},
			grindr::Restriction::TimedBan(details) => Self {
				kind: "timedBan".to_owned(),
				region: None,
				reason: details.reason,
			},
			grindr::Restriction::TrustVendorRejected => Self {
				kind: "trustVendorRejected".to_owned(),
				region: None,
				reason: None,
			},
			grindr::Restriction::Other(raw) => Self {
				kind: "other".to_owned(),
				region: None,
				reason: Some(raw),
			},
			_ => Self {
				kind: "other".to_owned(),
				region: None,
				reason: None,
			},
		}
	}
}

fn region_str(region: grindr::VerificationRegion) -> &'static str {
	match region {
		grindr::VerificationRegion::Uk => "uk",
		grindr::VerificationRegion::Br => "br",
		grindr::VerificationRegion::Au => "au",
		_ => "other",
	}
}

#[tauri::command]
pub async fn sign_in_with_email(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	media: tauri::State<'_, MediaProxy>,
	email: String,
	password: String,
	captcha_token: Option<String>,
) -> Result<SignInResult, AppError> {
	end_existing_session(&app, &state, &media).await?;
	let client = state.client()?;
	let result = match captcha_token {
		Some(token) => {
			client
				.sign_in_with_email_captcha(&email, &password, &token)
				.await?
		}
		None => client.sign_in_with_email(&email, &password).await?,
	};
	Ok(SignInResult::from(result))
}

#[tauri::command]
pub async fn sign_in_with_google(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	media: tauri::State<'_, MediaProxy>,
) -> Result<SignInResult, AppError> {
	let access_token =
		super::google_oauth::fetch_google_access_token(&app).await?;
	end_existing_session(&app, &state, &media).await?;
	let result = state.client()?.sign_in_with_google(&access_token).await?;
	Ok(SignInResult::from(result))
}

#[tauri::command]
pub async fn sign_in_with_google_token(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	media: tauri::State<'_, MediaProxy>,
	token: String,
) -> Result<SignInResult, AppError> {
	end_existing_session(&app, &state, &media).await?;
	let result = state.client()?.sign_in_with_google(&token).await?;
	Ok(SignInResult::from(result))
}

#[tauri::command]
pub fn backend_ready(state: tauri::State<'_, AppState>) -> bool {
	state.client().is_ok()
}

#[tauri::command]
pub fn google_handoff_pending(app: tauri::AppHandle) -> bool {
	super::google_oauth::handoff_pending(&app)
}

#[tauri::command]
pub async fn sign_in_with_google_handoff(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	media: tauri::State<'_, MediaProxy>,
) -> Result<Option<SignInResult>, AppError> {
	let Some(token) = super::google_oauth::take_handoff(&app) else {
		return Ok(None);
	};
	end_existing_session(&app, &state, &media).await?;
	let result = state.client()?.sign_in_with_google(&token).await?;
	Ok(Some(SignInResult::from(result)))
}

#[tauri::command]
pub fn discard_google_handoff(app: tauri::AppHandle) {
	super::google_oauth::discard_handoff(&app);
}

#[tauri::command]
pub async fn sign_in_with_facebook(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	media: tauri::State<'_, MediaProxy>,
) -> Result<SignInResult, AppError> {
	let access_token =
		super::facebook_oauth::fetch_facebook_access_token(&app).await?;
	end_existing_session(&app, &state, &media).await?;
	let result = state.client()?.sign_in_with_facebook(&access_token).await?;
	Ok(SignInResult::from(result))
}

#[tauri::command]
pub async fn refresh_session(
	state: tauri::State<'_, AppState>,
	geohash: Option<String>,
) -> Result<SignInResult, AppError> {
	let client = state.client()?;
	let result = client
		.refresh_session_at_geohash(geohash.as_deref())
		.await
		.map_err(|e| AppError::from_client_error(e, client))?;
	Ok(SignInResult::from(result))
}

#[tauri::command]
pub async fn sign_out(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	media: tauri::State<'_, MediaProxy>,
) -> Result<(), AppError> {
	end_session(&app, &state, &media).await
}

pub(crate) async fn end_session(
	app: &tauri::AppHandle,
	state: &AppState,
	media: &MediaProxy,
) -> Result<(), AppError> {
	let _one_at_a_time = SIGN_OUT.lock().await;
	forget_account(state.client()?, media).await?;
	super::facebook_oauth::forget_sign_in_profile(app).await;
	Ok(())
}

async fn end_existing_session(
	app: &tauri::AppHandle,
	state: &AppState,
	media: &MediaProxy,
) -> Result<(), AppError> {
	if state.client()?.session_receiver().borrow().is_none() {
		return Ok(());
	}
	end_session(app, state, media).await
}

pub(crate) async fn forget_account(
	client: &grindr::GrindrClient,
	media: &MediaProxy,
) -> Result<(), AppError> {
	client.sign_out().await;
	AuthStorage::delete_credentials();
	SigningKeyStorage::delete();
	media.forget_everything().await;

	let new_device = grindr::DeviceInfo::generate();
	if let Err(e) = DeviceStorage::save(&new_device) {
		tracing::error!(
			"[auth] could not persist rotated device info on sign out: {e}"
		);
		DeviceStorage::delete();
	}
	client.rotate_device(new_device).await?;

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
pub async fn account_restriction(
	state: tauri::State<'_, AppState>,
) -> Result<Option<Restriction>, AppError> {
	let Ok(client) = state.client() else {
		return Ok(None);
	};
	Ok(client
		.session_receiver()
		.borrow()
		.as_ref()
		.and_then(|s| s.token.as_ref()?.restriction.clone())
		.map(Restriction::from))
}

#[cfg(test)]
mod tests {
	use super::*;

	#[cfg(any(
		target_os = "linux",
		all(target_os = "macos", not(feature = "keychain"))
	))]
	#[test]
	fn ending_a_session_forgets_the_account_and_moves_to_a_new_device() {
		crate::storage::test_support::with_file_store(|_| {
			let old_device = grindr::DeviceInfo::generate();
			let credentials = grindr::Credentials {
				email: "user@example.com".to_owned(),
				profile_id: Some("42".to_owned()),
				auth_token: "auth-token".to_owned(),
				kind: grindr::SessionKind::Email,
				third_party_user_id: None,
			};
			DeviceStorage::save(&old_device).unwrap();
			AuthStorage::set_credentials(&credentials).unwrap();
			SigningKeyStorage::save(
				&serde_json::from_value(serde_json::json!({
					"key": "-----BEGIN PRIVATE KEY-----",
					"user_id": "42",
				}))
				.unwrap(),
			)
			.unwrap();
			let client = grindr::GrindrClient::new(
				old_device.clone(),
				Some(grindr::Session {
					credentials,
					token: None,
				}),
			)
			.unwrap();

			let runtime = tokio::runtime::Runtime::new().unwrap();
			runtime
				.block_on(forget_account(&client, &MediaProxy::default()))
				.unwrap();

			assert!(client.session_receiver().borrow().is_none());
			assert!(AuthStorage::get_credentials().unwrap().is_none());
			assert!(SigningKeyStorage::load().unwrap().is_none());
			let stored = DeviceStorage::load().unwrap().expect("a new device");
			assert_ne!(stored.device_id, old_device.device_id);
			assert_eq!(
				runtime.block_on(client.current_device()).device_id,
				stored.device_id
			);
		});
	}

	#[test]
	fn simulated_age_restriction_maps_to_frontend_shape() {
		let restriction: grindr::Restriction = serde_json::from_str(
			r#"{"AgeVerification":{"region":"Uk","reason":"UK_VERIFICATION_REQUIRED"}}"#,
		)
		.unwrap();

		let mapped = Restriction::from(restriction);
		let json = serde_json::to_value(&mapped).unwrap();
		assert_eq!(json["kind"], "ageVerification");
		assert_eq!(json["region"], "uk");
		assert_eq!(json["reason"], "UK_VERIFICATION_REQUIRED");
	}
}
