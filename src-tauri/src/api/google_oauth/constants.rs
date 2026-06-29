#![allow(dead_code)]

pub const AUTH_URL: &str = "https://android.clients.google.com/auth";

// GMS app-signing cert SHA-1, sent as client_sig to pass as first-party Play Services.
pub const GMS_CLIENT_SIG: &str = "38918a453d07199354f8b19af05ec6562ced5788";
pub const GMS_PACKAGE: &str = "com.google.android.gms";

pub const EMBEDDED_SETUP_URL: &str = "https://accounts.google.com/EmbeddedSetup";
pub const ACCOUNTS_ORIGIN: &str = "https://accounts.google.com";

pub const OAUTH_SERVICE: &str = "oauth2:https://www.googleapis.com/auth/userinfo.email \
     https://www.googleapis.com/auth/userinfo.profile openid";

pub const GOOGLE_AUTH_UA: &str = "GoogleAuth/1.4 (Pixel TQ3A.230901.001); gzip";
pub const PLAY_SERVICES_VERSION: &str = "240913000";
pub const SDK_VERSION: &str = "34";

pub const EMBEDDED_SETUP_UA: &str = "Mozilla/5.0 (Linux; Android 14; Pixel 7) \
     AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36";

pub const WINDOW_LABEL: &str = "google-oauth";
