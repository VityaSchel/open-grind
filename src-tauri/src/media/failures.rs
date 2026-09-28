use std::collections::VecDeque;
use std::time::{SystemTime, UNIX_EPOCH};

use grindr::GrindrError;
use serde::Serialize;

use super::target::host_of;
use super::upstream::FetchError;

const REMEMBERED_FAILURES: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FailureKind {
	Status,
	Connect,
	Transport,
	TooLarge,
	Refused,
	NotReady,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFailure {
	pub kind: FailureKind,
	pub status: Option<u16>,
	pub host: String,
	pub signature_expired: bool,
}

impl MediaFailure {
	pub fn of_status(status: u16, url: &str) -> Self {
		Self::new(FailureKind::Status, Some(status), url)
	}

	pub fn of_error(error: &FetchError, url: &str) -> Self {
		let kind = match error {
			FetchError::Busy => FailureKind::NotReady,
			FetchError::Oversized => FailureKind::TooLarge,
			FetchError::Upstream(GrindrError::InvalidRequest(_)) => {
				FailureKind::Refused
			}
			FetchError::Upstream(GrindrError::Connect(_)) => {
				FailureKind::Connect
			}
			FetchError::Upstream(_) => FailureKind::Transport,
		};
		Self::new(kind, None, url)
	}

	fn new(kind: FailureKind, status: Option<u16>, url: &str) -> Self {
		Self {
			kind,
			status,
			host: host_of(url).to_owned(),
			signature_expired: signature_expired(url),
		}
	}
}

fn signature_expired(url: &str) -> bool {
	let Some((_, query)) = url.split_once('?') else {
		return false;
	};
	let expires = query
		.split('&')
		.find_map(|pair| pair.strip_prefix("Expires="))
		.and_then(|value| value.parse::<u64>().ok());
	let now = SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map_or(0, |elapsed| elapsed.as_secs());
	expires.is_some_and(|expires| expires <= now)
}

#[derive(Default)]
pub struct Failures {
	entries: VecDeque<(String, MediaFailure)>,
}

impl Failures {
	pub fn record(&mut self, key: &str, failure: MediaFailure) {
		self.forget(key);
		self.entries.push_back((key.to_owned(), failure));
		if self.entries.len() > REMEMBERED_FAILURES {
			self.entries.pop_front();
		}
	}

	pub fn forget(&mut self, key: &str) {
		self.entries.retain(|(entry, _)| entry != key);
	}

	pub fn get(&self, key: &str) -> Option<MediaFailure> {
		self.entries
			.iter()
			.find(|(entry, _)| entry == key)
			.map(|(_, failure)| failure.clone())
	}

	pub fn clear(&mut self) {
		self.entries.clear();
	}

	#[cfg(test)]
	pub fn is_empty(&self) -> bool {
		self.entries.is_empty()
	}
}

pub fn target_path_of(src: &str) -> Option<&str> {
	let (_, rest) = src.split_once("://")?;
	let path = &rest[rest.find('/')?..];
	Some(path.split(['?', '#']).next().unwrap_or(path))
}

#[cfg(test)]
mod tests {
	use super::*;

	const SIGNED: &str =
		"https://d3.cloudfront.net/chat/p.jpg?Expires=1&Signature=S&Key-Pair-Id=K";

	#[test]
	fn a_failure_names_only_the_host() {
		let failure = MediaFailure::of_status(403, SIGNED);

		let json = serde_json::to_string(&failure).unwrap();

		assert_eq!(
			json,
			r#"{"kind":"status","status":403,"host":"d3.cloudfront.net","signatureExpired":true}"#
		);
	}

	#[test]
	fn a_signature_still_valid_is_not_expired() {
		let valid =
			"https://d3.cloudfront.net/p.jpg?Expires=99999999999&Signature=S";

		assert!(!MediaFailure::of_status(502, valid).signature_expired);
		assert!(
			!MediaFailure::of_status(404, "https://cdns.grindr.com/x")
				.signature_expired
		);
	}

	#[test]
	fn transport_errors_are_told_apart() {
		let kind = |error| MediaFailure::of_error(&error, SIGNED).kind;

		assert_eq!(kind(FetchError::Busy), FailureKind::NotReady);
		assert_eq!(kind(FetchError::Oversized), FailureKind::TooLarge);
		assert_eq!(
			kind(FetchError::Upstream(GrindrError::Connect("dns".into()))),
			FailureKind::Connect
		);
		assert_eq!(
			kind(FetchError::Upstream(GrindrError::Http("reset".into()))),
			FailureKind::Transport
		);
		assert_eq!(
			kind(FetchError::Upstream(GrindrError::InvalidRequest(
				"host".into()
			))),
			FailureKind::Refused
		);
	}

	#[test]
	fn the_latest_failure_of_a_file_replaces_the_earlier_one() {
		let mut failures = Failures::default();

		failures.record("a", MediaFailure::of_status(502, SIGNED));
		failures.record("a", MediaFailure::of_status(403, SIGNED));

		assert_eq!(failures.get("a").unwrap().status, Some(403));
		failures.forget("a");
		assert!(failures.get("a").is_none());
	}

	#[test]
	fn only_the_most_recent_failures_are_remembered() {
		let mut failures = Failures::default();

		for index in 0..=REMEMBERED_FAILURES {
			failures.record(
				&index.to_string(),
				MediaFailure::of_status(502, SIGNED),
			);
		}

		assert!(failures.get("0").is_none());
		assert!(failures.get(&REMEMBERED_FAILURES.to_string()).is_some());
	}

	#[test]
	fn the_target_path_is_read_from_either_webview_url_form() {
		for src in [
			"ogmedia://localhost/iPAYLOAD",
			"http://ogmedia.localhost/iPAYLOAD?r=1",
			"http://ogmedia.localhost/iPAYLOAD#t=0.001",
		] {
			assert_eq!(target_path_of(src), Some("/iPAYLOAD"), "{src}");
		}
		assert_eq!(target_path_of("not a url"), None);
	}
}
