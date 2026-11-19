#[cfg(target_os = "android")]
pub mod android;

#[cfg(any(mobile, test))]
use tauri::utils::config::AndroidHostname;
use tauri::utils::config::AppConfig;
use tauri::Url;

pub const APP_HOSTNAME: &str = "app.opengrind.org";

#[derive(Clone, Copy)]
pub struct ServedOrigin {
	scheme: &'static str,
	hostname: &'static str,
}

#[cfg(all(target_os = "android", not(dev)))]
pub const SERVED_ORIGIN: Option<ServedOrigin> = Some(ServedOrigin {
	scheme: "https",
	hostname: APP_HOSTNAME,
});
#[cfg(all(target_os = "ios", not(dev)))]
pub const SERVED_ORIGIN: Option<ServedOrigin> = Some(ServedOrigin {
	scheme: "tauri",
	hostname: APP_HOSTNAME,
});
#[cfg(any(
	all(target_os = "android", dev),
	all(target_os = "ios", dev),
	desktop
))]
pub const SERVED_ORIGIN: Option<ServedOrigin> = None;

#[cfg(mobile)]
fn served_hostname() -> Option<AndroidHostname> {
	SERVED_ORIGIN.map(|origin| {
		origin
			.hostname
			.parse()
			.expect("APP_HOSTNAME is a valid app hostname")
	})
}

#[cfg(target_os = "android")]
pub fn serve_from_app_hostname(app: &mut AppConfig) {
	app.android_hostname = served_hostname();
}

#[cfg(target_os = "ios")]
pub fn serve_from_app_hostname(app: &mut AppConfig) {
	app.ios_hostname = served_hostname();
}

#[cfg(desktop)]
pub fn serve_from_app_hostname(_: &mut AppConfig) {}

pub fn is_served_locally(host: &str) -> bool {
	let host = host.trim_end_matches('.');
	host == APP_HOSTNAME || host == "localhost" || host.ends_with(".localhost")
}

pub fn is_app_url(url: &Url, served_origin: Option<ServedOrigin>) -> bool {
	if let Some(origin) = served_origin {
		return url.scheme() == origin.scheme
			&& url.host_str() == Some(origin.hostname)
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

	fn served(scheme: &'static str) -> Option<ServedOrigin> {
		Some(ServedOrigin {
			scheme,
			hostname: APP_HOSTNAME,
		})
	}

	fn allows(url: &str, served_origin: Option<ServedOrigin>) -> bool {
		is_app_url(&Url::parse(url).unwrap(), served_origin)
	}

	#[test]
	fn the_app_hostname_passes_tauris_validation() {
		APP_HOSTNAME.parse::<AndroidHostname>().unwrap();
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
			"tauri://app.opengrind.org/",
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
	fn the_android_origin_is_the_only_app_origin_on_android() {
		let served = served("https");
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
			"tauri://app.opengrind.org/",
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

	#[test]
	fn the_ios_origin_is_the_only_app_origin_on_ios() {
		let served = served("tauri");
		for url in [
			"tauri://app.opengrind.org",
			"tauri://app.opengrind.org/",
			"tauri://app.opengrind.org/chat/1?tab=albums#top",
		] {
			assert!(allows(url, served), "{url} must load");
		}
		for url in [
			"tauri://APP.opengrind.org/",
			"tauri://app.opengrind.org:443/",
			"tauri://user@app.opengrind.org/",
			"tauri://app.opengrind.org./",
			"tauri://sub.app.opengrind.org/",
			"tauri://app.opengrind.org.example.org/",
			"https://app.opengrind.org/",
			"tauri://localhost/",
			"ogmedia://localhost/aHR0cHM6Ly9leGFtcGxlLm9yZw",
			"ipc://localhost/",
			"http://localhost:1420/",
		] {
			assert!(!allows(url, served), "{url} must not load");
		}
	}
}
