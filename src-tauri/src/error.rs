use std::fmt;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BanInfo {
	pub kind: String,
	pub code: i32,
	pub message: String,
	pub reason: Option<String>,
	pub sub_reason: Option<String>,
	pub automated: Option<bool>,
}

impl From<grindr::BanInfo> for BanInfo {
	fn from(b: grindr::BanInfo) -> Self {
		let kind = match b.kind {
			grindr::BanKind::Profile => "profile",
			grindr::BanKind::Device => "device",
			grindr::BanKind::Network => "network",
			grindr::BanKind::Underage => "underage",
			_ => "unknown",
		};
		Self {
			kind: kind.to_owned(),
			code: b.code,
			message: b.message,
			reason: b.reason,
			sub_reason: b.sub_reason,
			automated: b.automated,
		}
	}
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
	Http(String),
	Auth(String),
	Media(String),
	NotLoggedIn,
	Api { code: i32, message: String },
	Unauthorized { code: i32, message: String },
	Banned(BanInfo),
	RateLimited,
	RequestBlocked,
	NetworkBlocked,
	NotInitialized,
	SessionCleared,
}

impl fmt::Display for AppError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			AppError::Http(msg) => write!(f, "HTTP error: {msg}"),
			AppError::Auth(msg) => write!(f, "Auth error: {msg}"),
			AppError::Media(msg) => write!(f, "Media error: {msg}"),
			AppError::NotLoggedIn => write!(f, "Not logged in"),
			AppError::Api { code, message } => {
				write!(f, "API error {code}: {message}")
			}
			AppError::Unauthorized { code, message } => {
				write!(f, "Unauthorized ({code}): {message}")
			}
			AppError::Banned(info) => {
				write!(f, "Banned ({}): {}", info.kind, info.message)
			}
			AppError::RateLimited => write!(f, "Rate limited"),
			AppError::RequestBlocked => {
				write!(f, "Request blocked by Cloudflare")
			}
			AppError::NetworkBlocked => {
				write!(f, "Request blocked before it reached Grindr")
			}
			AppError::SessionCleared => {
				write!(f, "Signed out while the request was in flight")
			}
			AppError::NotInitialized => {
				write!(f, "GrindrClient not initialized")
			}
		}
	}
}

impl std::error::Error for AppError {}

impl From<grindr::GrindrError> for AppError {
	fn from(e: grindr::GrindrError) -> Self {
		match e {
			grindr::GrindrError::Http(msg) => AppError::Http(msg),
			grindr::GrindrError::Auth(msg) => AppError::Auth(msg),
			grindr::GrindrError::Api { code, message } => {
				AppError::Api { code, message }
			}
			grindr::GrindrError::Unauthorized { code, message } => {
				AppError::Unauthorized { code, message }
			}
			grindr::GrindrError::Banned(info) => AppError::Banned(info.into()),
			grindr::GrindrError::RateLimited => AppError::RateLimited,
			grindr::GrindrError::Blocked(grindr::BlockKind::Cloudflare) => {
				AppError::RequestBlocked
			}
			grindr::GrindrError::Blocked(_) => AppError::NetworkBlocked,
			grindr::GrindrError::SessionCleared => AppError::SessionCleared,
			_ => AppError::Http(e.to_string()),
		}
	}
}

impl AppError {
	pub fn from_client_error(
		error: grindr::GrindrError,
		client: &grindr::GrindrClient,
	) -> Self {
		let signed_in = client.session_receiver().borrow().is_some();
		match AppError::from(error) {
			AppError::Auth(_) if !signed_in => AppError::NotLoggedIn,
			mapped => mapped,
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn simulated_ban_response_maps_to_banned_app_error() {
		let raw = grindr::GrindrError::from_response(
            403,
            br#"{"code":27,"message":"Profile is banned","banSubReason":"DRUG_SALES","isBanAutomated":true}"#,
        );
		let app = AppError::from(raw);

		let json = serde_json::to_value(&app).unwrap();
		assert_eq!(json["kind"], "Banned");
		assert_eq!(json["message"]["kind"], "profile");
		assert_eq!(json["message"]["code"], 27);
		assert_eq!(json["message"]["subReason"], "DRUG_SALES");
		assert_eq!(json["message"]["automated"], true);
	}

	#[tokio::test]
	async fn auth_failure_without_a_session_maps_to_not_logged_in() {
		let client =
			grindr::GrindrClient::new(grindr::DeviceInfo::generate(), None)
				.unwrap();
		let error = client.refresh_token().await.unwrap_err();

		let app = AppError::from_client_error(error, &client);

		assert!(matches!(app, AppError::NotLoggedIn));
		assert_eq!(serde_json::to_value(&app).unwrap()["kind"], "NotLoggedIn");
	}

	#[test]
	fn auth_failure_with_a_session_stays_an_auth_error() {
		let session: grindr::Session =
			serde_json::from_value(serde_json::json!({
				"email": "user@example.com",
				"expires_at": 9_999_999_999u64,
				"profile_id": "42",
				"session_id": "session-token",
				"auth_token": "auth-token",
			}))
			.unwrap();
		let client = grindr::GrindrClient::new(
			grindr::DeviceInfo::generate(),
			Some(session),
		)
		.unwrap();

		let app = AppError::from_client_error(
			grindr::GrindrError::Auth("device key rejected".to_owned()),
			&client,
		);

		assert!(matches!(app, AppError::Auth(_)));
	}

	#[test]
	fn simulated_rate_limit_maps_to_rate_limited() {
		let app =
			AppError::from(grindr::GrindrError::from_response(429, b"{}"));
		assert_eq!(serde_json::to_value(&app).unwrap()["kind"], "RateLimited");
	}

	#[test]
	fn cloudflare_block_maps_to_request_blocked() {
		let block_page = br#"<html><head><title>Attention Required! | Cloudflare</title></head><body>Sorry, you have been blocked</body></html>"#;
		let raw = grindr::GrindrError::from_response(403, block_page);
		let app = AppError::from(raw);
		assert_eq!(
			serde_json::to_value(&app).unwrap()["kind"],
			"RequestBlocked"
		);
	}

	#[test]
	fn a_non_cloudflare_block_maps_to_network_blocked() {
		let proxy_page = br#"<html><body>Forbidden by your network administrator</body></html>"#;
		let raw = grindr::GrindrError::from_response(403, proxy_page);
		let app = AppError::from(raw);
		assert_eq!(
			serde_json::to_value(&app).unwrap()["kind"],
			"NetworkBlocked"
		);
	}
}
