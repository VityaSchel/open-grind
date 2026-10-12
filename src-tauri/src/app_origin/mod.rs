#[cfg(target_os = "android")]
pub mod android;

use tauri::utils::config::AndroidHostname;
use tauri::Url;

pub const ANDROID_HOSTNAME: &str = "app.opengrind.org";

pub const SERVED_HOSTNAME: Option<&str> =
	if cfg!(all(target_os = "android", not(dev))) {
		Some(ANDROID_HOSTNAME)
	} else {
		None
	};

pub fn android_hostname() -> Option<AndroidHostname> {
	SERVED_HOSTNAME.map(|hostname| {
		hostname
			.parse()
			.expect("ANDROID_HOSTNAME is a valid androidHostname")
	})
}

pub fn is_served_locally(host: &str) -> bool {
	let host = host.trim_end_matches('.');
	host == ANDROID_HOSTNAME
		|| host == "localhost"
		|| host.ends_with(".localhost")
}

pub fn is_app_url(url: &Url, served_hostname: Option<&str>) -> bool {
	if let Some(hostname) = served_hostname {
		return url.scheme() == "https"
			&& url.host_str() == Some(hostname)
			&& url.port().is_none()
			&& url.username().is_empty()
			&& url.password().is_none();
	}
	let host = url.host_str();
	match url.scheme() {
		"tauri" => host == Some("localhost"),
		"http" | "https" => {
			host == Some("tauri.localhost")
				|| (cfg!(debug_assertions)
					&& matches!(host, Some("localhost") | Some("127.0.0.1")))
		}
		_ => false,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn allows(url: &str, served_hostname: Option<&str>) -> bool {
		is_app_url(&Url::parse(url).unwrap(), served_hostname)
	}

	#[test]
	fn the_android_hostname_passes_tauris_validation() {
		ANDROID_HOSTNAME.parse::<AndroidHostname>().unwrap();
	}

	#[test]
	fn admits_the_bundled_asset_origins() {
		assert!(allows("tauri://localhost/", None));
		assert!(allows("tauri://localhost/chat/1", None));
		assert!(allows("http://tauri.localhost/", None));
		assert!(allows("https://tauri.localhost/", None));
	}

	#[test]
	fn refuses_navigation_away_from_the_app() {
		for url in [
			"https://example.org/",
			"tauri://example.org/",
			"http://tauri.localhost.example.org/",
			"https://app.opengrind.org/",
			"file:///etc/passwd",
			"javascript:alert(1)",
			"data:text/html,<script>1</script>",
			"ogmedia://localhost/aHR0cHM6Ly9leGFtcGxlLm9yZw",
			"http://ogmedia.localhost/aHR0cHM6Ly9leGFtcGxlLm9yZw",
		] {
			assert!(
				!allows(url, None),
				"{url} must not load in the main webview"
			);
		}
	}

	#[test]
	fn a_served_hostname_is_the_only_app_origin() {
		let served = Some(ANDROID_HOSTNAME);
		for url in [
			"https://app.opengrind.org/",
			"https://app.opengrind.org/chat/1?tab=albums#top",
			"https://APP.opengrind.org:443/",
		] {
			assert!(allows(url, served), "{url} must load");
		}
		for url in [
			"http://app.opengrind.org/",
			"https://app.opengrind.org:8443/",
			"https://user@app.opengrind.org/",
			"https://app.opengrind.org./",
			"https://sub.app.opengrind.org/",
			"https://app.opengrind.org.example.org/",
			"https://opengrind.org/",
			"tauri://localhost/",
			"http://tauri.localhost/",
			"https://tauri.localhost/",
			"https://ogmedia.localhost/aHR0cHM6Ly9leGFtcGxlLm9yZw",
			"https://ipc.localhost/",
			"http://localhost:1420/",
		] {
			assert!(!allows(url, served), "{url} must not load");
		}
	}
}
