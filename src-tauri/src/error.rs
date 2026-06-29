use std::fmt;

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    Http(String),
    Auth(String),
    Api { code: i32, message: String },
    Unauthorized { code: i32, message: String },
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
            _ => AppError::Http(e.to_string()),
        }
    }
}

// The native Google sign-in flow talks to Google directly over its own wreq client.
impl From<wreq::Error> for AppError {
    fn from(e: wreq::Error) -> Self {
        AppError::Http(e.to_string())
    }
}

impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
    }
}
