use grindr::{GrindrError, MediaFetcher, MediaRequest, MediaResponse};
use tauri::http::{header, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime};

use crate::state::AppState;

use super::cache::CachedMedia;
use super::response::{
	bounded_range, deliver, deliverable_status, refused, Freshness,
};
use super::target::host_of;
use super::{MediaProxy, MAX_MEDIA_BYTES};

pub enum FetchError {
	Busy,
	Oversized,
	Upstream(GrindrError),
}

pub fn windowable(error: &FetchError, fetcher: MediaFetcher) -> bool {
	let body_will_never_fit = matches!(error, FetchError::Oversized);
	let deadline_ran_out =
		matches!(error, FetchError::Upstream(GrindrError::Http(_)));
	let plays_from_windows = fetcher == MediaFetcher::MediaPlayer;

	body_will_never_fit || (deadline_ran_out && plays_from_windows)
}

pub fn detail_of(error: &FetchError) -> String {
	match error {
		FetchError::Busy => "no client".to_owned(),
		FetchError::Oversized => {
			format!("media body exceeds {MAX_MEDIA_BYTES} bytes")
		}
		FetchError::Upstream(error) => without_url(error.to_string()),
	}
}

fn classify(error: GrindrError) -> FetchError {
	match error {
		GrindrError::MediaTooLarge { .. } => FetchError::Oversized,
		error => FetchError::Upstream(error),
	}
}

pub async fn fetch<R: Runtime>(
	app: &AppHandle<R>,
	url: &str,
	fetcher: MediaFetcher,
	range: Option<&str>,
) -> Result<MediaResponse, FetchError> {
	let proxy = app.state::<MediaProxy>();
	let Ok(_permit) = proxy.fetches.acquire().await else {
		return Err(FetchError::Busy);
	};
	let Ok(client) = app.state::<AppState>().client().cloned() else {
		return Err(FetchError::Busy);
	};
	client
		.fetch_media(MediaRequest {
			url,
			range,
			max_bytes: MAX_MEDIA_BYTES,
			fetcher,
		})
		.await
		.map_err(classify)
}

fn without_url(mut message: String) -> String {
	const MARKER: &str = " for url (";
	let Some(start) = message.find(MARKER) else {
		return message;
	};
	let rest = start + MARKER.len();
	match message[rest..].find(')') {
		Some(end) => message.replace_range(start..rest + end + 1, ""),
		None => message.truncate(start),
	}
	message
}

fn refusal_detail(error: FetchError) -> Result<String, StatusCode> {
	match error {
		FetchError::Busy => Err(StatusCode::SERVICE_UNAVAILABLE),
		FetchError::Upstream(GrindrError::InvalidRequest(_)) => {
			Err(StatusCode::BAD_REQUEST)
		}
		FetchError::Oversized => {
			Ok(format!("media body exceeds {MAX_MEDIA_BYTES} bytes"))
		}
		FetchError::Upstream(error) => Ok(without_url(error.to_string())),
	}
}

pub fn refusal(error: FetchError, url: &str) -> Response<Vec<u8>> {
	match refusal_detail(error) {
		Err(status) => refused(status),
		Ok(detail) => {
			tracing::warn!(
				"[media] fetch failed for {}: {detail}",
				host_of(url)
			);
			refused(StatusCode::BAD_GATEWAY)
		}
	}
}

pub fn deliver_upstream(
	fetched: MediaResponse,
	is_head: bool,
) -> Response<Vec<u8>> {
	let Some(status) = deliverable_status(fetched.status) else {
		return refused(StatusCode::BAD_GATEWAY);
	};
	let media = CachedMedia {
		content_type: fetched.content_type,
		body: fetched.body,
	};
	let mut response = deliver(&media, status, is_head, Freshness::Uncacheable);
	for (name, value) in [
		(header::CONTENT_RANGE, fetched.content_range),
		(header::ACCEPT_RANGES, fetched.accept_ranges),
	] {
		if let Some(value) = value.as_deref().and_then(|v| v.parse().ok()) {
			response.headers_mut().insert(name, value);
		}
	}
	response
}

pub async fn serve_windowed<R: Runtime>(
	app: &AppHandle<R>,
	url: &str,
	fetcher: MediaFetcher,
	range: Option<&str>,
	is_head: bool,
) -> Response<Vec<u8>> {
	let window = bounded_range(range.unwrap_or("bytes=0-"));
	match fetch(app, url, fetcher, Some(&window)).await {
		Ok(fetched) => deliver_upstream(fetched, is_head),
		Err(error) => refusal(error, url),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn only_a_video_whose_deadline_ran_out_is_worth_windowing() {
		let timed_out = FetchError::Upstream(GrindrError::Http(
			"operation timed out".to_owned(),
		));

		assert!(windowable(&timed_out, MediaFetcher::MediaPlayer));
		assert!(!windowable(&timed_out, MediaFetcher::ImageLoader));
	}

	#[test]
	fn a_body_over_the_ceiling_is_windowed_whatever_asked_for_it() {
		for fetcher in [MediaFetcher::MediaPlayer, MediaFetcher::ImageLoader] {
			assert!(windowable(&FetchError::Oversized, fetcher));
		}
	}

	#[test]
	fn a_failure_no_smaller_request_could_survive_is_never_windowed() {
		let hopeless = [
			FetchError::Busy,
			FetchError::Upstream(GrindrError::Connect("offline".to_owned())),
			FetchError::Upstream(GrindrError::SessionCleared),
			FetchError::Upstream(GrindrError::InvalidRequest(
				"bad url".to_owned(),
			)),
		];

		for error in hopeless {
			assert!(!windowable(&error, MediaFetcher::MediaPlayer));
		}
	}

	#[test]
	fn a_fallback_detail_never_carries_the_signed_query() {
		let detail = detail_of(&FetchError::Upstream(GrindrError::Http(
			"error sending request for url (https://d3.cloudfront.net/a.mp4?Signature=SECRET): reset"
				.to_owned(),
		)));

		assert!(!detail.contains("SECRET"), "{detail}");
	}

	#[test]
	fn only_the_ceiling_error_itself_marks_a_file_oversized() {
		assert!(matches!(
			classify(GrindrError::MediaTooLarge {
				max_bytes: MAX_MEDIA_BYTES
			}),
			FetchError::Oversized
		));
		assert!(matches!(
			classify(GrindrError::Http("connection reset".to_owned())),
			FetchError::Upstream(_)
		));
		assert!(matches!(
			classify(GrindrError::Http(format!(
				"media body exceeds {MAX_MEDIA_BYTES} bytes"
			))),
			FetchError::Upstream(_)
		));
	}

	#[test]
	fn a_signed_url_never_survives_into_the_log_line() {
		let signed = "https://d3.cloudfront.net/a.mp4?Expires=1&Signature=SECRET&Key-Pair-Id=K1";

		assert_eq!(
			without_url(format!(
				"error sending request for url ({signed}): connection reset"
			)),
			"error sending request: connection reset"
		);
		assert_eq!(
			without_url(format!("operation timed out for url ({signed})")),
			"operation timed out"
		);
		assert_eq!(
			without_url(format!("truncated for url ({signed}")),
			"truncated"
		);
		assert_eq!(
			without_url("connection reset by peer".to_owned()),
			"connection reset by peer"
		);
	}

	#[test]
	fn what_gets_logged_never_carries_the_signed_query() {
		let signed = "https://d3.cloudfront.net/a.mp4?Signature=SECRET";

		let detail = refusal_detail(FetchError::Upstream(GrindrError::Http(
			format!("error sending request for url ({signed}): reset"),
		)))
		.expect("an upstream failure is logged");

		assert_eq!(detail, "HTTP error: error sending request: reset");
		assert!(!detail.contains("SECRET"));
	}

	#[test]
	fn each_failure_maps_to_the_status_the_webview_should_see() {
		let cases = [
			(FetchError::Busy, StatusCode::SERVICE_UNAVAILABLE),
			(
				FetchError::Upstream(
					GrindrError::InvalidRequest(String::new()),
				),
				StatusCode::BAD_REQUEST,
			),
			(FetchError::Oversized, StatusCode::BAD_GATEWAY),
			(
				FetchError::Upstream(GrindrError::Http("timeout".to_owned())),
				StatusCode::BAD_GATEWAY,
			),
		];
		for (error, status) in cases {
			let response = refusal(error, "https://cdns.grindr.com/x");
			assert_eq!(response.status(), status);
			assert!(response.body().is_empty());
		}
	}

	#[test]
	fn upstream_range_headers_ride_along_and_redirects_never_leave() {
		let fetched = MediaResponse {
			status: 206,
			content_type: Some("video/mp4".to_owned()),
			content_range: Some("bytes 0-1/2210039".to_owned()),
			accept_ranges: Some("bytes".to_owned()),
			body: grindr::Bytes::from_static(b"xy"),
		};
		let response = deliver_upstream(fetched, false);
		assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
		assert_eq!(
			response.headers().get(header::CONTENT_RANGE).unwrap(),
			"bytes 0-1/2210039"
		);

		let redirect = MediaResponse {
			status: 302,
			content_type: None,
			content_range: None,
			accept_ranges: None,
			body: grindr::Bytes::new(),
		};
		assert_eq!(
			deliver_upstream(redirect, false).status(),
			StatusCode::BAD_GATEWAY
		);
	}
}
