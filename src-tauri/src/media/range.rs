use tauri::http::{header, Response, StatusCode};

use super::cache::CachedMedia;
use super::response::{deliver, refused, Freshness};

enum Slice {
	Whole,
	Part { start: usize, end: usize },
	Unsatisfiable,
}

fn parse_range(range: Option<&str>, len: usize) -> Slice {
	let Some(spec) = range.and_then(|value| value.strip_prefix("bytes="))
	else {
		return Slice::Whole;
	};
	if spec.contains(',') {
		return Slice::Whole;
	}
	let Some((start, end)) = spec.split_once('-') else {
		return Slice::Whole;
	};
	if start.is_empty() {
		let Ok(suffix) = end.parse::<u64>() else {
			return Slice::Whole;
		};
		if suffix == 0 || len == 0 {
			return Slice::Unsatisfiable;
		}
		let take = suffix.min(len as u64) as usize;
		return Slice::Part {
			start: len - take,
			end: len,
		};
	}
	let Ok(first) = start.parse::<u64>() else {
		return Slice::Whole;
	};
	if first >= len as u64 {
		return Slice::Unsatisfiable;
	}
	let last = if end.is_empty() {
		len as u64 - 1
	} else {
		match end.parse::<u64>() {
			Ok(last) if last >= first => last.min(len as u64 - 1),
			_ => return Slice::Whole,
		}
	};
	Slice::Part {
		start: first as usize,
		end: last as usize + 1,
	}
}

pub fn deliver_ranged(
	media: &CachedMedia,
	range: Option<&str>,
	is_head: bool,
	freshness: Freshness,
) -> Response<Vec<u8>> {
	let total = media.body.len();
	let (mut response, content_range) = match parse_range(range, total) {
		Slice::Whole => {
			(deliver(media, StatusCode::OK, is_head, freshness), None)
		}
		Slice::Part { start, end } => (
			deliver(
				&CachedMedia {
					content_type: media.content_type.clone(),
					body: media.body.slice(start..end),
				},
				StatusCode::PARTIAL_CONTENT,
				is_head,
				freshness,
			),
			Some(format!("bytes {start}-{}/{total}", end - 1)),
		),
		Slice::Unsatisfiable => (
			refused(StatusCode::RANGE_NOT_SATISFIABLE),
			Some(format!("bytes */{total}")),
		),
	};
	let headers = response.headers_mut();
	headers.insert(
		header::ACCEPT_RANGES,
		header::HeaderValue::from_static("bytes"),
	);
	if let Some(value) = content_range.and_then(|value| value.parse().ok()) {
		headers.insert(header::CONTENT_RANGE, value);
	}
	response
}

#[cfg(test)]
mod tests {
	use super::*;

	fn media(body: &'static [u8]) -> CachedMedia {
		CachedMedia {
			content_type: Some("video/mp4".to_owned()),
			body: grindr::Bytes::from_static(body),
		}
	}

	fn ranged(range: &str) -> Response<Vec<u8>> {
		deliver_ranged(
			&media(b"1234567890"),
			Some(range),
			false,
			Freshness::Uncacheable,
		)
	}

	fn header_str(
		response: &Response<Vec<u8>>,
		name: header::HeaderName,
	) -> Option<&str> {
		response.headers().get(name).and_then(|v| v.to_str().ok())
	}

	#[test]
	fn no_range_is_the_whole_body_advertising_ranges() {
		let response = deliver_ranged(
			&media(b"1234567890"),
			None,
			false,
			Freshness::Uncacheable,
		);

		assert_eq!(response.status(), StatusCode::OK);
		assert_eq!(response.body().as_slice(), b"1234567890");
		assert_eq!(header_str(&response, header::ACCEPT_RANGES), Some("bytes"));
		assert_eq!(header_str(&response, header::CONTENT_RANGE), None);
	}

	#[test]
	fn a_closed_range_is_the_slice_it_names() {
		let response = ranged("bytes=0-3");

		assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
		assert_eq!(response.body().as_slice(), b"1234");
		assert_eq!(
			header_str(&response, header::CONTENT_RANGE),
			Some("bytes 0-3/10")
		);
		assert_eq!(header_str(&response, header::CONTENT_LENGTH), Some("4"));
	}

	#[test]
	fn every_answer_advertises_ranges_or_players_refuse_to_seek() {
		for range in [None, Some("bytes=0-3"), Some("bytes=99-")] {
			let response = deliver_ranged(
				&media(b"1234567890"),
				range,
				false,
				Freshness::Uncacheable,
			);

			assert_eq!(
				header_str(&response, header::ACCEPT_RANGES),
				Some("bytes"),
				"{range:?}"
			);
		}
	}

	#[test]
	fn an_open_ended_range_runs_to_the_last_byte() {
		let response = ranged("bytes=4-");

		assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
		assert_eq!(response.body().as_slice(), b"567890");
		assert_eq!(
			header_str(&response, header::CONTENT_RANGE),
			Some("bytes 4-9/10")
		);
	}

	#[test]
	fn a_suffix_range_is_the_tail() {
		let response = ranged("bytes=-3");

		assert_eq!(response.body().as_slice(), b"890");
		assert_eq!(
			header_str(&response, header::CONTENT_RANGE),
			Some("bytes 7-9/10")
		);
	}

	#[test]
	fn an_end_past_the_body_is_clamped_like_a_cdn_would() {
		let response = ranged("bytes=8-99");

		assert_eq!(response.body().as_slice(), b"90");
		assert_eq!(
			header_str(&response, header::CONTENT_RANGE),
			Some("bytes 8-9/10")
		);
	}

	#[test]
	fn a_start_past_the_body_is_unsatisfiable() {
		for range in ["bytes=10-", "bytes=99-105", "bytes=-0"] {
			let response = ranged(range);

			assert_eq!(
				response.status(),
				StatusCode::RANGE_NOT_SATISFIABLE,
				"{range}"
			);
			assert!(response.body().is_empty());
			assert_eq!(
				header_str(&response, header::CONTENT_RANGE),
				Some("bytes */10")
			);
		}
	}

	#[test]
	fn an_empty_body_satisfies_no_range() {
		let response = deliver_ranged(
			&media(b""),
			Some("bytes=0-"),
			false,
			Freshness::Uncacheable,
		);

		assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
		assert_eq!(
			header_str(&response, header::CONTENT_RANGE),
			Some("bytes */0")
		);
	}

	#[test]
	fn anything_unparseable_is_answered_with_the_whole_body() {
		for range in [
			"bytes=5-2",
			"bytes=a-b",
			"bytes=0-1,3-4",
			"seconds=1-2",
			"nonsense",
			"bytes=99999999999999999999-",
		] {
			let response = ranged(range);

			assert_eq!(response.status(), StatusCode::OK, "{range}");
			assert_eq!(response.body().as_slice(), b"1234567890", "{range}");
		}
	}

	#[test]
	fn a_head_keeps_the_range_headers_and_drops_the_slice() {
		let response = deliver_ranged(
			&media(b"1234567890"),
			Some("bytes=0-3"),
			true,
			Freshness::Uncacheable,
		);

		assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
		assert!(response.body().is_empty());
		assert_eq!(header_str(&response, header::CONTENT_LENGTH), Some("4"));
		assert_eq!(
			header_str(&response, header::CONTENT_RANGE),
			Some("bytes 0-3/10")
		);
	}
}
