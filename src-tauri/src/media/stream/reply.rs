use tauri::http::{header, Response, StatusCode};

use super::super::registry::{register_stream, STREAM_HEADER};
use super::super::requested::Requested;
use super::super::response::{refused, Freshness};
use super::super::target::host_of;
use super::super::upstream::GatewayFailure;
use super::adapter::WebViewStream;

pub const TELLS_THE_LENGTH: bool = cfg!(target_vendor = "apple");

pub struct Streamed {
	pub id: u64,
	pub status: u16,
	pub content_type: Option<String>,
	pub content_range: Option<String>,
	pub length: Option<u64>,
}

pub fn streamed(response: Streamed) -> Response<Vec<u8>> {
	let mut builder = Response::builder()
		.status(response.status)
		.header(
			header::CONTENT_TYPE,
			response
				.content_type
				.as_deref()
				.unwrap_or("application/octet-stream"),
		)
		.header(header::ACCEPT_RANGES, "bytes")
		.header(header::CACHE_CONTROL, Freshness::Uncacheable.directive())
		.header(STREAM_HEADER, response.id);
	if let Some(content_range) = response.content_range {
		builder = builder.header(header::CONTENT_RANGE, content_range);
	}
	if let Some(length) = response.length.filter(|_| TELLS_THE_LENGTH) {
		builder = builder.header(header::CONTENT_LENGTH, length);
	}
	builder
		.body(Vec::new())
		.unwrap_or_else(|_| refused(StatusCode::INTERNAL_SERVER_ERROR))
}

pub fn refuse(status: u16, at: u64) -> Response<Vec<u8>> {
	streamed(Streamed {
		id: register_stream(Box::new(WebViewStream::empty_at(at))),
		status,
		content_type: None,
		content_range: None,
		length: Some(0),
	})
}

pub fn poison() -> Response<Vec<u8>> {
	streamed(Streamed {
		id: register_stream(Box::new(WebViewStream::poisoned())),
		status: 200,
		content_type: None,
		content_range: None,
		length: None,
	})
}

pub fn deny(status: StatusCode, at: u64) -> Response<Vec<u8>> {
	if at == 0 {
		return refused(status);
	}
	refuse(status.as_u16(), at)
}

pub fn unreachable(
	url: &str,
	requested: &Requested,
	failure: GatewayFailure,
) -> Response<Vec<u8>> {
	tracing::warn!(
		"[media] stream failed for {}: {}",
		host_of(url),
		failure.detail
	);
	if requested.start() == 0 {
		return refused(failure.status);
	}
	poison()
}
