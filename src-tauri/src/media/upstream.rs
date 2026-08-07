use grindr::{GrindrError, MediaFetcher, MediaRequest, MediaResponse};
use tauri::http::{header, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime};

use crate::state::AppState;

use super::cache::CachedMedia;
use super::response::{bounded_range, deliver, deliverable_status, refused};
use super::target::host_of;
use super::{MediaProxy, MAX_MEDIA_BYTES};

pub enum FetchError {
	Busy,
	Oversized,
	Upstream(GrindrError),
}

/// Mirrors grindr's ceiling error text, its only signal for an oversized body.
fn ceiling_message() -> String {
	format!("media body exceeds {MAX_MEDIA_BYTES} bytes")
}

fn classify(error: GrindrError) -> FetchError {
	match error {
		GrindrError::Http(message) if message == ceiling_message() => {
			FetchError::Oversized
		}
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

pub fn refusal(error: FetchError, url: &str) -> Response<Vec<u8>> {
	let error = match error {
		FetchError::Busy => return refused(StatusCode::SERVICE_UNAVAILABLE),
		FetchError::Upstream(GrindrError::InvalidRequest(_)) => {
			return refused(StatusCode::BAD_REQUEST)
		}
		FetchError::Oversized => ceiling_message(),
		FetchError::Upstream(error) => error.to_string(),
	};
	tracing::warn!("[media] fetch failed for {}: {error}", host_of(url));
	refused(StatusCode::BAD_GATEWAY)
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
	let mut response = deliver(&media, status, is_head);
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
	fn only_the_exact_ceiling_text_marks_a_file_oversized() {
		assert!(matches!(
			classify(GrindrError::Http(ceiling_message())),
			FetchError::Oversized
		));
		assert!(matches!(
			classify(GrindrError::Http("connection reset".to_owned())),
			FetchError::Upstream(_)
		));
		assert!(matches!(
			classify(GrindrError::InvalidRequest(ceiling_message())),
			FetchError::Upstream(_)
		));
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
