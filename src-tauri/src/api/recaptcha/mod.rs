#[cfg(target_os = "android")]
mod android;
mod error;

#[cfg(target_os = "android")]
pub use android::plugin;
pub use error::RecaptchaError;

use serde::Deserialize;
use tauri::AppHandle;

use crate::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecaptchaAction {
	SignUp,
	Login,
	ForgotPassword,
	Report,
	DecisionAppeal,
	DeviceKeyRegistration,
}

impl RecaptchaAction {
	pub fn as_str(self) -> &'static str {
		match self {
			Self::SignUp => "sign_up",
			Self::Login => "login",
			Self::ForgotPassword => "forgot_password",
			Self::Report => "report",
			Self::DecisionAppeal => "decision_appeal",
			Self::DeviceKeyRegistration => "device_key_registration",
		}
	}
}

#[tauri::command]
pub async fn mint_recaptcha_token(
	app: AppHandle,
	action: RecaptchaAction,
) -> Result<String, AppError> {
	mint_token(&app, action).await
}

pub async fn mint_token(
	app: &AppHandle,
	action: RecaptchaAction,
) -> Result<String, AppError> {
	#[cfg(target_os = "android")]
	let minted = android::mint_token(app, action).await;
	#[cfg(any(target_os = "ios", desktop))]
	let minted = {
		let _ = (app, action);
		Err(RecaptchaError::UnsupportedPlatform)
	};
	Ok(header_safe(minted?)?)
}

fn header_safe(token: String) -> Result<String, RecaptchaError> {
	let printable = token.bytes().all(|byte| (0x21..=0x7E).contains(&byte));
	if token.is_empty() || !printable {
		return Err(RecaptchaError::MalformedToken);
	}
	Ok(token)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn every_action_sends_the_wire_string_grindr_expects() {
		for (action, wire) in [
			(RecaptchaAction::SignUp, "sign_up"),
			(RecaptchaAction::Login, "login"),
			(RecaptchaAction::ForgotPassword, "forgot_password"),
			(RecaptchaAction::Report, "report"),
			(RecaptchaAction::DecisionAppeal, "decision_appeal"),
			(
				RecaptchaAction::DeviceKeyRegistration,
				"device_key_registration",
			),
		] {
			assert_eq!(action.as_str(), wire);
		}
	}

	#[test]
	fn every_wire_action_deserializes_into_the_action_that_sends_it() {
		let wires: Vec<String> =
			serde_json::from_str(include_str!("actions.json")).unwrap();
		assert_eq!(wires.len(), 6);
		for wire in wires {
			let action: RecaptchaAction =
				serde_json::from_value(serde_json::json!(wire)).unwrap();
			assert_eq!(action.as_str(), wire);
		}
	}

	#[test]
	fn an_action_outside_the_wire_vocabulary_is_rejected() {
		for wire in [
			serde_json::json!("Report"),
			serde_json::json!("SignUp"),
			serde_json::json!("sign-up"),
			serde_json::json!("report "),
			serde_json::json!(""),
			serde_json::json!(null),
			serde_json::json!(3),
		] {
			assert!(
				serde_json::from_value::<RecaptchaAction>(wire.clone())
					.is_err(),
				"{wire} was accepted"
			);
		}
	}

	#[test]
	fn a_printable_token_is_returned_unchanged() {
		let token = format!("0cAFcWeA{}", "Ab-_9".repeat(700));
		assert_eq!(header_safe(token.clone()), Ok(token));
		assert_eq!(header_safe("!~".into()), Ok("!~".to_owned()));
	}

	#[test]
	fn an_empty_token_is_malformed() {
		assert_eq!(
			header_safe(String::new()),
			Err(RecaptchaError::MalformedToken)
		);
	}

	#[test]
	fn a_token_that_could_break_out_of_a_header_is_malformed() {
		for token in [
			"0cAFcWeA\r\nX-Injected: 1",
			"0cAFcWeA\nabc",
			"0cAFcWeA abc",
			"0cAFcWeA\tabc",
			"0cAFcWeA\0abc",
			"0cAFcWeA\u{7f}",
			"0cAFcWeAé",
		] {
			assert_eq!(
				header_safe(token.to_owned()),
				Err(RecaptchaError::MalformedToken),
				"{token:?} was accepted"
			);
		}
	}
}
