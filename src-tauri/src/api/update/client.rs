use std::time::Duration;

use wreq::header::{HeaderValue, ACCEPT_ENCODING};
use wreq::{redirect, Client, RequestBuilder, Response};

use super::error::UpdateError;

const RELEASE_ORIGIN: &str = "https://git.opengrind.org/";

pub fn origin() -> String {
	super::dev::origin().unwrap_or_else(|| RELEASE_ORIGIN.to_owned())
}

pub fn build() -> Result<Client, UpdateError> {
	let origin = origin();
	Client::builder()
		.https_only(origin.starts_with("https://"))
		.min_tls_version(wreq::tls::TlsVersion::TLS_1_2)
		.redirect(release_origin_only(origin))
		.referer(false)
		.connect_timeout(Duration::from_secs(15))
		.read_timeout(Duration::from_secs(30))
		.pool_idle_timeout(Duration::from_secs(10))
		.pool_max_idle_per_host(1)
		.build()
		.map_err(|e| UpdateError::Network(e.to_string()))
}

// Identity encoding keeps a 206 body a byte range of the real file.
pub fn get(client: &Client, url: &str) -> RequestBuilder {
	client
		.get(url)
		.header(ACCEPT_ENCODING, HeaderValue::from_static("identity"))
}

fn release_origin_only(origin: String) -> redirect::Policy {
	redirect::Policy::custom(move |attempt| {
		match follow_redirect(
			&origin,
			attempt.url().as_str(),
			attempt.previous().len(),
		) {
			Ok(()) => attempt.follow(),
			Err(refusal) => attempt.error(refusal),
		}
	})
}

fn follow_redirect(
	origin: &str,
	url: &str,
	hops: usize,
) -> Result<(), &'static str> {
	if hops >= 3 {
		return Err("too many redirects");
	}
	if url.starts_with(origin) {
		Ok(())
	} else {
		Err("redirect leaves the release host")
	}
}

pub async fn text_within(
	mut response: Response,
	max: usize,
	reject: fn(String) -> UpdateError,
) -> Result<String, UpdateError> {
	let mut body = Vec::new();
	while let Some(chunk) = response
		.chunk()
		.await
		.map_err(|e| UpdateError::Network(e.to_string()))?
	{
		if body.len() + chunk.len() > max {
			return Err(reject("response is implausibly large".into()));
		}
		body.extend_from_slice(&chunk);
	}
	String::from_utf8(body).map_err(|_| reject("response is not text".into()))
}

pub fn assert_release_origin(url: &str) -> Result<(), UpdateError> {
	let origin = origin();
	let sane = url.starts_with(&origin)
		&& url.len() > origin.len()
		&& !url.contains(|c: char| c.is_control() || c.is_whitespace());
	if sane {
		Ok(())
	} else {
		Err(UpdateError::ForeignUrl(url.to_owned()))
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn accepts_urls_under_the_release_origin() {
		let url = format!("{}releases/download/v1.2.3/app.apk", origin());
		assert!(assert_release_origin(&url).is_ok());
	}

	#[test]
	fn rejects_other_hosts_and_userinfo_smuggling() {
		for url in [
			"https://evil.example/app.apk",
			"http://git.opengrind.org/app.apk",
			"https://git.opengrind.org.evil.example/app.apk",
			"https://git.opengrind.org@evil.example/app.apk",
			"https://git.opengrind.org",
			"https://git.opengrind.org/app.apk\nHost: evil",
		] {
			assert!(assert_release_origin(url).is_err(), "accepted {url}");
		}
	}

	fn header_names(request: &wreq::Request) -> Vec<String> {
		let mut names: Vec<_> = request
			.headers()
			.keys()
			.map(|key| key.as_str().to_owned())
			.collect();
		names.sort();
		names
	}

	#[test]
	fn a_request_carries_nothing_that_identifies_the_install() {
		let client = build().unwrap();
		let request = get(&client, "https://git.opengrind.org/api/v1/version")
			.build()
			.unwrap();

		assert_eq!(header_names(&request), vec!["accept-encoding"]);
		assert_eq!(request.headers()["accept-encoding"], "identity");
	}

	#[test]
	fn a_resumed_transfer_adds_only_range_headers() {
		let client = build().unwrap();
		let request = get(&client, "https://git.opengrind.org/x.apk")
			.header(wreq::header::RANGE, "bytes=100-")
			.header(wreq::header::IF_RANGE, "\"bb49c042\"")
			.build()
			.unwrap();

		assert_eq!(
			header_names(&request),
			vec!["accept-encoding", "if-range", "range"]
		);
	}

	#[test]
	fn redirects_stay_on_the_release_origin() {
		let origin = origin();
		let allowed = format!("{origin}releases/download/v1/app.apk");
		assert!(follow_redirect(&origin, &allowed, 0).is_ok());
		assert!(follow_redirect(&origin, &allowed, 2).is_ok());
		assert!(follow_redirect(&origin, &allowed, 3).is_err());
		for url in [
			"https://evil.example/app.apk",
			"https://git.opengrind.org.evil.example/app.apk",
			"https://git.opengrind.org@evil.example/app.apk",
			"http://git.opengrind.org/app.apk",
		] {
			assert!(
				follow_redirect(&origin, url, 0).is_err(),
				"followed {url}"
			);
		}
	}
}
