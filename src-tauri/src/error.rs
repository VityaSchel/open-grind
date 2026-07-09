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
    Api { code: i32, message: String },
    Unauthorized { code: i32, message: String },
    Banned(BanInfo),
    RateLimited,
    NotInitialized,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Http(msg) => write!(f, "HTTP error: {msg}"),
            AppError::Auth(msg) => write!(f, "Auth error: {msg}"),
            AppError::Api { code, message } => write!(f, "API error {code}: {message}"),
            AppError::Unauthorized { code, message } => {
                write!(f, "Unauthorized ({code}): {message}")
            }
            AppError::Banned(info) => write!(f, "Banned ({}): {}", info.kind, info.message),
            AppError::RateLimited => write!(f, "Rate limited"),
            AppError::NotInitialized => write!(f, "GrindrClient not initialized"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<grindr::GrindrError> for AppError {
    fn from(e: grindr::GrindrError) -> Self {
        match e {
            grindr::GrindrError::Http(msg) => AppError::Http(msg),
            grindr::GrindrError::Auth(msg) => AppError::Auth(msg),
            grindr::GrindrError::Api { code, message } => AppError::Api { code, message },
            grindr::GrindrError::Unauthorized { code, message } => {
                AppError::Unauthorized { code, message }
            }
            grindr::GrindrError::Banned(info) => AppError::Banned(info.into()),
            grindr::GrindrError::RateLimited => AppError::RateLimited,
            _ => AppError::Http(e.to_string()),
        }
    }
}

impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
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

    #[test]
    fn simulated_rate_limit_maps_to_rate_limited() {
        let app = AppError::from(grindr::GrindrError::from_response(429, b"{}"));
        assert_eq!(serde_json::to_value(&app).unwrap()["kind"], "RateLimited");
    }
}
