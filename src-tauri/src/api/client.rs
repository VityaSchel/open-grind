use std::sync::{Arc, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};
use wreq::{
    Client, EmulationProvider, Http2Config, PseudoOrder, SettingsOrder, SslCurve, TlsConfig,
    TlsVersion,
};

use crate::error::AppError;
use crate::state::AppState;

use super::auth::Session;
use super::headers::{build_user_agent, DeviceInfo, DeviceStorage};

pub const BASE_URL: &str = "https://grindr.mobi";

/// References https://opengrind.org/grindr-api/security-headers#cipher-suites
const MODERN_TLS_CIPHERS: &str = concat!(
    "TLS_AES_128_GCM_SHA256",
    ":TLS_AES_256_GCM_SHA384",
    ":TLS_CHACHA20_POLY1305_SHA256",
    ":TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
    ":TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    ":TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
    ":TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    ":TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
    ":TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
    ":TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
    ":TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
    ":TLS_RSA_WITH_AES_128_GCM_SHA256",
    ":TLS_RSA_WITH_AES_256_GCM_SHA384",
    ":TLS_RSA_WITH_AES_128_CBC_SHA",
    ":TLS_RSA_WITH_AES_256_CBC_SHA",
);

/// References https://opengrind.org/grindr-api/security-headers#extensions
const SIGALGS: &str = concat!(
    "ecdsa_secp256r1_sha256",
    ":rsa_pss_rsae_sha256",
    ":rsa_pkcs1_sha256",
    ":ecdsa_secp384r1_sha384",
    ":rsa_pss_rsae_sha384",
    ":rsa_pkcs1_sha384",
    ":rsa_pss_rsae_sha512",
    ":rsa_pkcs1_sha512",
    ":rsa_pkcs1_sha1",
);

const CURVES: &[SslCurve] = &[SslCurve::X25519, SslCurve::SECP256R1, SslCurve::SECP384R1];

/// References https://opengrind.org/grindr-api/security-headers#pseudoheaders
const PSEUDO_ORDER: [PseudoOrder; 4] = [
    PseudoOrder::Method,
    PseudoOrder::Path,
    PseudoOrder::Authority,
    PseudoOrder::Scheme,
];

/// References https://opengrind.org/grindr-api/security-headers#frames
const SETTINGS_ORDER: [SettingsOrder; 8] = [
    SettingsOrder::InitialWindowSize,
    SettingsOrder::HeaderTableSize,
    SettingsOrder::EnablePush,
    SettingsOrder::MaxConcurrentStreams,
    SettingsOrder::MaxFrameSize,
    SettingsOrder::MaxHeaderListSize,
    SettingsOrder::UnknownSetting8,
    SettingsOrder::UnknownSetting9,
];

const OKHTTP_CLIENT_WINDOW_SIZE: u32 = 16 * 1024 * 1024;

fn okhttp_tls_config() -> TlsConfig {
    TlsConfig::builder()
        .enable_ocsp_stapling(true)
        .pre_shared_key(true)
        .curves(CURVES)
        .sigalgs_list(SIGALGS)
        .cipher_list(MODERN_TLS_CIPHERS)
        .min_tls_version(TlsVersion::TLS_1_2)
        .max_tls_version(TlsVersion::TLS_1_3)
        .build()
}

fn okhttp_http2_config() -> Http2Config {
    Http2Config::builder()
        .initial_stream_window_size(OKHTTP_CLIENT_WINDOW_SIZE)
        .initial_connection_window_size(OKHTTP_CLIENT_WINDOW_SIZE)
        .headers_pseudo_order(PSEUDO_ORDER)
        .settings_order(SETTINGS_ORDER)
        .build()
}

fn grindr_emulation() -> EmulationProvider {
    EmulationProvider::builder()
        .tls_config(okhttp_tls_config())
        .http2_config(okhttp_http2_config())
        .default_headers(None)
        .build()
}

pub struct Fingerprint {
    /// ALPN: `["h2", "http/1.1"]`
    pub http: Client,
    /// ALPN: `["http/1.1"]`
    pub ws_http: Client,
    pub device: DeviceInfo,
    pub user_agent: String,
}

pub struct GrindrClient {
    pub(super) fingerprint: RwLock<Arc<Fingerprint>>,
    pub(super) session: RwLock<Option<Session>>,
    pub(super) refresh_lock: Mutex<()>,
    pub(super) app: OnceLock<AppHandle>,
}

#[derive(Debug, Serialize)]
pub struct RotateResult {
    #[serde(rename = "user-agent")]
    pub user_agent: String,
    #[serde(rename = "l-device-info")]
    pub l_device_info: String,
}

fn build_api_client() -> Result<Client, AppError> {
    Client::builder()
        .emulation(grindr_emulation())
        .gzip(true)
        .no_deflate()
        .no_brotli()
        .no_zstd()
        .build()
        .map_err(Into::into)
}

fn build_ws_client() -> Result<Client, AppError> {
    Client::builder()
        .emulation(grindr_emulation())
        .gzip(true)
        .no_deflate()
        .no_brotli()
        .no_zstd()
        .http1_only()
        .build()
        .map_err(Into::into)
}

impl GrindrClient {
    pub fn new() -> Result<Self, AppError> {
        let device = match DeviceStorage::load() {
            Ok(Some(d)) => d,
            Ok(None) => {
                let d = DeviceInfo::default();
                if let Err(e) = DeviceStorage::save(&d) {
                    eprintln!("[client] could not persist device info: {e}");
                }
                d
            }
            Err(e) => {
                eprintln!("[client] could not load device info, regenerating: {e}");
                DeviceInfo::default()
            }
        };
        let user_agent = build_user_agent(&device, "Free");

        let http = build_api_client()?;
        let ws_http = build_ws_client()?;

        #[cfg(all(target_os = "macos", not(feature = "keychain")))]
        let session = None;
        #[cfg(not(all(target_os = "macos", not(feature = "keychain"))))]
        let session = match super::auth::AuthStorage::get_session() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[client] could not load session: {e}");
                None
            }
        };

        Ok(Self {
            fingerprint: RwLock::new(Arc::new(Fingerprint {
                http,
                ws_http,
                device,
                user_agent,
            })),
            session: RwLock::new(session),
            refresh_lock: Mutex::new(()),
            app: OnceLock::new(),
        })
    }

    pub fn set_app_handle(&self, app: AppHandle) {
        let _ = self.app.set(app);
    }

    pub(super) fn emit<S: Serialize + Clone>(&self, event: &str, payload: S) {
        if let Some(app) = self.app.get() {
            if let Err(e) = app.emit(event, payload) {
                eprintln!("[client] failed to emit {event}: {e}");
            }
        }
    }

    pub async fn clear_session(&self) {
        self.session.write().await.take();
        super::auth::AuthStorage::delete_session();
    }

    pub async fn fingerprint(&self) -> Arc<Fingerprint> {
        Arc::clone(&*self.fingerprint.read().await)
    }

    #[allow(dead_code)]
    pub async fn reload_session(&self) {
        match super::auth::AuthStorage::get_session() {
            Ok(s) => *self.session.write().await = s,
            Err(e) => eprintln!("[client] reload_session: {e}"),
        }
    }
}

#[tauri::command]
pub async fn rotate_api_params(
    state: tauri::State<'_, AppState>,
) -> Result<RotateResult, AppError> {
    let client = state.client()?;

    let device = DeviceInfo::default();
    if let Err(e) = DeviceStorage::save(&device) {
        eprintln!("[client] could not persist rotated device info: {e}");
    }
    let user_agent = build_user_agent(&device, "Free");
    let http = build_api_client()?;
    let ws_http = build_ws_client()?;

    let new_fp = Arc::new(Fingerprint {
        http,
        ws_http,
        device,
        user_agent,
    });

    let old_fp = {
        let mut guard = client.fingerprint.write().await;
        std::mem::replace(&mut *guard, new_fp)
    };

    Ok(RotateResult {
        user_agent: old_fp.user_agent.clone(),
        l_device_info: super::headers::build_device_info_header(&old_fp.device),
    })
}

/// Used by `ci/fingerprint_check.rs`
pub fn probe_emulation() -> EmulationProvider {
    grindr_emulation()
}
