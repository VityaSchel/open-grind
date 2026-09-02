use tauri::http::{header, Response, StatusCode};

use super::cache::CachedMedia;

const RANGE_WINDOW_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Freshness {
	Immutable,
	Uncacheable,
}

impl Freshness {
	pub fn of(url: &str) -> Self {
		let content_addressed = url
			.starts_with("https://cdns.grindr.com/images/")
			&& !url.contains('?');
		if content_addressed {
			Self::Immutable
		} else {
			Self::Uncacheable
		}
	}

	fn directive(self) -> &'static str {
		match self {
			Self::Immutable => "private, max-age=604800, immutable",
			Self::Uncacheable => "no-store",
		}
	}
}

/// wry hands the WebView nothing at all for a 3xx or a status outside
/// 100..=599, and Android then falls through to a real network load of the
/// ogmedia url, which resolves nowhere.
/// <https://github.com/tauri-apps/wry/blob/wry-v0.55.1/src/android/binding.rs#L174>
pub fn deliverable_status(status: u16) -> Option<StatusCode> {
	if !(100..600).contains(&status) {
		return None;
	}
	StatusCode::from_u16(status)
		.ok()
		.filter(|status| !status.is_redirection())
}

/// Tauri responds in one buffered piece, so a span wider than the window —
/// like the open-ended `bytes=N-` every player seeks with — would pull the
/// whole file into memory.
/// <https://github.com/tauri-apps/tauri/blob/tauri-v2.11.1/crates/tauri/src/app.rs#L2454>
pub fn bounded_range(range: &str) -> String {
	let Some(spec) = range.strip_prefix("bytes=") else {
		return range.to_owned();
	};
	let Some((start, end)) = spec.split_once('-') else {
		return range.to_owned();
	};
	if start.is_empty() {
		return match end.parse::<u64>() {
			Ok(suffix) if suffix > RANGE_WINDOW_BYTES => {
				format!("bytes=-{RANGE_WINDOW_BYTES}")
			}
			_ => range.to_owned(),
		};
	}
	let Ok(first) = start.parse::<u64>() else {
		return range.to_owned();
	};
	let window_end = first.saturating_add(RANGE_WINDOW_BYTES - 1);
	let last = match end.parse::<u64>() {
		Ok(last) => last.min(window_end),
		Err(_) if end.is_empty() => window_end,
		Err(_) => return range.to_owned(),
	};
	format!("bytes={first}-{last}")
}

pub fn refused(status: StatusCode) -> Response<Vec<u8>> {
	Response::builder()
		.status(status)
		.header(header::CACHE_CONTROL, Freshness::Uncacheable.directive())
		.body(Vec::new())
		.unwrap_or_default()
}

pub fn deliver(
	media: &CachedMedia,
	status: StatusCode,
	is_head: bool,
	freshness: Freshness,
) -> Response<Vec<u8>> {
	Response::builder()
		.status(status)
		.header(
			header::CONTENT_TYPE,
			media
				.content_type
				.as_deref()
				.unwrap_or("application/octet-stream"),
		)
		.header(header::CONTENT_LENGTH, media.body.len())
		.header(header::CACHE_CONTROL, freshness.directive())
		.body(if is_head {
			Vec::new()
		} else {
			media.body.to_vec()
		})
		.unwrap_or_else(|_| refused(StatusCode::INTERNAL_SERVER_ERROR))
}

#[cfg(test)]
mod tests {
	use super::*;

	fn media(content_type: Option<&str>) -> CachedMedia {
		CachedMedia {
			content_type: content_type.map(str::to_owned),
			body: grindr::Bytes::from_static(b"1234567890"),
		}
	}

	#[test]
	fn an_open_ended_range_becomes_one_window() {
		assert_eq!(bounded_range("bytes=0-"), "bytes=0-2097151");
		assert_eq!(bounded_range("bytes=2097152-"), "bytes=2097152-4194303");
	}

	#[test]
	fn a_span_wider_than_the_window_is_clamped() {
		assert_eq!(bounded_range("bytes=0-999999999"), "bytes=0-2097151");
		assert_eq!(bounded_range("bytes=-999999999"), "bytes=-2097152");
	}

	#[test]
	fn every_range_the_window_already_covers_is_forwarded_as_written() {
		for range in [
			"bytes=0-1",
			"bytes=100-199",
			"bytes=-500",
			"bytes=0-99,200-299",
			"seconds=0-",
			"nonsense",
		] {
			assert_eq!(bounded_range(range), range);
		}
	}

	#[test]
	fn a_status_the_webview_would_drop_never_leaves_the_handler() {
		assert_eq!(deliverable_status(200), Some(StatusCode::OK));
		assert_eq!(deliverable_status(206), Some(StatusCode::PARTIAL_CONTENT));
		assert_eq!(deliverable_status(403), Some(StatusCode::FORBIDDEN));

		for status in [301, 302, 303, 307, 308, 99, 600] {
			assert_eq!(deliverable_status(status), None, "{status}");
		}
	}

	#[test]
	fn a_refusal_carries_no_body_and_a_status_the_webview_accepts() {
		for status in [
			StatusCode::BAD_REQUEST,
			StatusCode::METHOD_NOT_ALLOWED,
			StatusCode::SERVICE_UNAVAILABLE,
			StatusCode::BAD_GATEWAY,
			StatusCode::INTERNAL_SERVER_ERROR,
		] {
			let response = refused(status);
			assert!(response.body().is_empty());
			assert!(deliverable_status(status.as_u16()).is_some());
		}
	}

	#[test]
	fn only_a_content_addressed_cdn_path_may_be_kept_by_the_webview() {
		assert_eq!(
			Freshness::of("https://cdns.grindr.com/images/thumb/320x320/abc"),
			Freshness::Immutable
		);
		for url in [
			"https://d3lyqctnm3b6pb.cloudfront.net/a.jpg?Expires=1&Signature=x",
			"https://d3lyqctnm3b6pb.cloudfront.net/a.jpg",
			"https://cdns.grindr.com/images/thumb/320x320/abc?v=2",
			"https://cdns.grindr.com/other/abc",
		] {
			assert_eq!(Freshness::of(url), Freshness::Uncacheable, "{url}");
		}
	}

	#[test]
	fn an_immutable_body_is_the_only_one_the_webview_is_told_to_keep() {
		let cacheable =
			deliver(&media(None), StatusCode::OK, false, Freshness::Immutable);
		assert_eq!(
			cacheable.headers().get(header::CACHE_CONTROL).unwrap(),
			"private, max-age=604800, immutable"
		);

		let uncacheable = deliver(
			&media(None),
			StatusCode::OK,
			false,
			Freshness::Uncacheable,
		);
		assert_eq!(
			uncacheable.headers().get(header::CACHE_CONTROL).unwrap(),
			"no-store"
		);
		assert_eq!(
			refused(StatusCode::BAD_GATEWAY)
				.headers()
				.get(header::CACHE_CONTROL)
				.unwrap(),
			"no-store"
		);
	}

	#[test]
	fn delivering_sizes_the_body_itself_rather_than_trusting_the_cdn() {
		let response =
			deliver(&media(None), StatusCode::OK, false, Freshness::Immutable);

		assert_eq!(
			response.headers().get(header::CONTENT_LENGTH).unwrap(),
			"10"
		);
		assert_eq!(
			response.headers().get(header::CONTENT_TYPE).unwrap(),
			"application/octet-stream"
		);
		assert_eq!(response.body().len(), 10);
	}

	#[test]
	fn a_head_keeps_the_headers_and_drops_the_bytes() {
		let response = deliver(
			&media(Some("video/mp4")),
			StatusCode::OK,
			true,
			Freshness::Uncacheable,
		);

		assert!(response.body().is_empty());
		assert_eq!(
			response.headers().get(header::CONTENT_LENGTH).unwrap(),
			"10"
		);
	}
}
