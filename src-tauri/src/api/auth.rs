use serde::Serialize;

use crate::error::AppError;
use crate::media::MediaProxy;
use crate::state::AppState;
use crate::storage::{AuthStorage, DeviceStorage, SigningKeyStorage};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
	pub profile_id: String,
	pub restriction: Option<Restriction>,
}

impl From<grindr::LoginResult> for LoginResult {
	fn from(r: grindr::LoginResult) -> Self {
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
	let access_token =
		super::google_oauth::fetch_google_access_token(&app).await?;
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
pub async fn refresh_token(
	state: tauri::State<'_, AppState>,
) -> Result<LoginResult, AppError> {
	let client = state.client()?;
	let result = client
		.refresh_token()
		.await
		.map_err(|e| AppError::from_client_error(e, client))?;
	Ok(LoginResult::from(result))
}

#[tauri::command]
pub async fn logout(
	state: tauri::State<'_, AppState>,
	media: tauri::State<'_, MediaProxy>,
) -> Result<(), AppError> {
	let client = state.client()?;

	client.logout().await;
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
pub async fn auth_state(
	state: tauri::State<'_, AppState>,
) -> Result<Option<u64>, AppError> {
	let Ok(client) = state.client() else {
		return Ok(None);
	};
	Ok(client
		.session_receiver()
		.borrow()
		.as_ref()
		.and_then(|s| s.credentials.profile_id.as_ref()?.parse::<u64>().ok()))
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
