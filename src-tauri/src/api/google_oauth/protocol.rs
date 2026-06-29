#![allow(dead_code)]

use std::collections::HashMap;

use wreq::Client;

use crate::error::AppError;

use super::constants::{
    AUTH_URL, GMS_CLIENT_SIG, GMS_PACKAGE, GOOGLE_AUTH_UA, OAUTH_SERVICE, PLAY_SERVICES_VERSION,
    SDK_VERSION,
};

fn auth_client() -> Result<Client, AppError> {
    Client::builder().gzip(true).build().map_err(Into::into)
}

// `/auth` replies with `key=value` lines; values can contain `=`, so split once.
fn parse_response(body: &str) -> HashMap<String, String> {
    body.lines()
        .filter_map(|line| line.split_once('='))
        .map(|(k, v)| (k.to_owned(), v.to_owned()))
        .collect()
}

async fn post_auth(params: &[(&str, &str)]) -> Result<HashMap<String, String>, AppError> {
    let resp = auth_client()?
        .post(AUTH_URL)
        .header("User-Agent", GOOGLE_AUTH_UA)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("device", params_lookup(params, "androidId"))
        .header("app", GMS_PACKAGE)
        .form(params)
        .send()
        .await?;

    let text = resp.text().await?;
    let map = parse_response(&text);

    if let Some(err) = map.get("Error") {
        let detail = map.get("ErrorDetail").map(String::as_str).unwrap_or("");
        return Err(AppError::Auth(format!(
            "Google auth rejected the request: {err}{}",
            if detail.is_empty() {
                String::new()
            } else {
                format!(" ({detail})")
            }
        )));
    }
    Ok(map)
}

fn params_lookup<'a>(params: &'a [(&'a str, &'a str)], key: &str) -> &'a str {
    params
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, v)| *v)
        .unwrap_or("")
}

pub struct MasterToken {
    pub token: String,
    pub email: String,
}

pub async fn exchange_master_token(
    oauth_token: &str,
    android_id: &str,
) -> Result<MasterToken, AppError> {
    let params = [
        ("androidId", android_id),
        ("lang", "en"),
        ("google_play_services_version", PLAY_SERVICES_VERSION),
        ("sdk_version", SDK_VERSION),
        ("device_country", "us"),
        ("Token", oauth_token),
        ("service", "ac2dm"),
        ("get_accountid", "1"),
        ("ACCESS_TOKEN", "1"),
        ("add_account", "1"),
        ("callerPkg", GMS_PACKAGE),
        ("callerSig", GMS_CLIENT_SIG),
        ("app", GMS_PACKAGE),
        ("client_sig", GMS_CLIENT_SIG),
        ("accountType", "HOSTED_OR_GOOGLE"),
        ("source", "android"),
        ("has_permission", "1"),
    ];

    let map = post_auth(&params).await?;
    let token = map
        .get("Token")
        .cloned()
        .ok_or_else(|| AppError::Auth("master-token response missing `Token`".into()))?;
    let email = map.get("Email").cloned().unwrap_or_default();
    Ok(MasterToken { token, email })
}

pub async fn exchange_access_token(
    master_token: &str,
    email: &str,
    android_id: &str,
) -> Result<String, AppError> {
    let params = [
        ("androidId", android_id),
        ("lang", "en"),
        ("google_play_services_version", PLAY_SERVICES_VERSION),
        ("sdk_version", SDK_VERSION),
        ("device_country", "us"),
        ("Email", email),
        ("Token", master_token),
        ("service", OAUTH_SERVICE),
        ("source", "android"),
        ("app", GMS_PACKAGE),
        ("client_sig", GMS_CLIENT_SIG),
        ("callerPkg", GMS_PACKAGE),
        ("callerSig", GMS_CLIENT_SIG),
        ("accountType", "HOSTED_OR_GOOGLE"),
        ("has_permission", "1"),
    ];

    let map = post_auth(&params).await?;
    map.get("Auth")
        .cloned()
        .ok_or_else(|| AppError::Auth("access-token response missing `Auth`".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_key_value_body_keeping_equals_in_value() {
        let body = "SID=abc\nAuth=ya29.a0=trailing==\nExpiry=123\n";
        let map = parse_response(body);
        assert_eq!(map.get("SID").unwrap(), "abc");
        assert_eq!(map.get("Auth").unwrap(), "ya29.a0=trailing==");
        assert_eq!(map.get("Expiry").unwrap(), "123");
    }

    #[test]
    fn params_lookup_finds_android_id() {
        let params = [("androidId", "deadbeef"), ("lang", "en")];
        assert_eq!(params_lookup(&params, "androidId"), "deadbeef");
        assert_eq!(params_lookup(&params, "missing"), "");
    }
}
