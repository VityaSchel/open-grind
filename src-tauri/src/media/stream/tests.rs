use std::io;

use tauri::http::{header, StatusCode};
use tauri::test::MockRuntime;
use tokio::task::spawn_blocking;

use super::super::registry::{
	unregister_stream, with_stream, ResponseStream, STREAM_HEADER,
};
use super::super::tests::{app_without_a_client, cache, header_str};
use super::super::{serve_by, Delivery};
use super::*;

pub(super) const VIDEO: &str =
	"https://d3.cloudfront.net/v.mp4?Expires=1&Signature=S";

pub(super) async fn streamed(
	app: &tauri::App<MockRuntime>,
	range: Option<&str>,
	is_head: bool,
) -> Response<Vec<u8>> {
	serve_by(
		Delivery::Streamed,
		app.handle(),
		VIDEO,
		MediaFetcher::MediaPlayer,
		range,
		is_head,
	)
	.await
}

pub(super) fn stream_id(response: &Response<Vec<u8>>) -> u64 {
	header_str(response, STREAM_HEADER)
		.expect("a stream id")
		.parse()
		.unwrap()
}

pub(super) fn read_to_end(
	stream: &mut dyn ResponseStream,
) -> io::Result<Vec<u8>> {
	let mut out = Vec::new();
	let mut buf = [0u8; 3];
	loop {
		match stream.read(&mut buf)? {
			0 => return Ok(out),
			n => out.extend_from_slice(&buf[..n]),
		}
	}
}

pub(super) async fn loaded_from(id: u64, at: u64) -> (u64, u64, Vec<u8>) {
	spawn_blocking(move || {
		with_stream(id, |stream| {
			let advertised = stream.available()?;
			let skipped = stream.skip(at)?;
			read_to_end(stream).map(|body| (advertised, skipped, body))
		})
	})
	.await
	.unwrap()
	.unwrap()
}

#[tokio::test]
async fn a_cached_seek_streams_the_tail_through_the_registry() {
	let app = app_without_a_client();
	cache(&app, VIDEO, b"1234567890").await;

	let response = streamed(&app, Some("bytes=4-"), false).await;

	assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
	assert!(response.body().is_empty());
	assert_eq!(
		header_str(&response, header::CONTENT_RANGE),
		Some("bytes 4-9/10")
	);
	assert_eq!(header_str(&response, header::ACCEPT_RANGES), Some("bytes"));
	assert_eq!(
		header_str(&response, header::CACHE_CONTROL),
		Some("no-store")
	);
	assert_eq!(
		header_str(&response, header::CONTENT_TYPE),
		Some("image/webp")
	);
	assert_eq!(
		header_str(&response, header::CONTENT_LENGTH),
		super::reply::TELLS_THE_LENGTH.then_some("6")
	);
	let id = stream_id(&response);
	assert_eq!(loaded_from(id, 4).await, (10, 4, b"567890".to_vec()));
	assert!(unregister_stream(id));
	assert!(!unregister_stream(id));
}

#[tokio::test]
async fn a_cached_whole_request_streams_from_zero_as_a_full_answer() {
	let app = app_without_a_client();
	cache(&app, VIDEO, b"1234567890").await;

	let response = streamed(&app, None, false).await;

	assert_eq!(response.status(), StatusCode::OK);
	assert_eq!(header_str(&response, header::CONTENT_RANGE), None);
	let id = stream_id(&response);
	assert_eq!(loaded_from(id, 0).await, (10, 0, b"1234567890".to_vec()));
	unregister_stream(id);
}

#[tokio::test]
async fn a_seek_past_the_cached_body_is_refused_through_an_empty_stream() {
	let app = app_without_a_client();
	cache(&app, VIDEO, b"1234567890").await;

	let response = streamed(&app, Some("bytes=10-"), false).await;

	assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
	let id = stream_id(&response);
	assert_eq!(loaded_from(id, 10).await, (11, 10, Vec::new()));
	unregister_stream(id);
}

#[tokio::test]
async fn a_head_takes_the_buffered_path() {
	let app = app_without_a_client();
	cache(&app, VIDEO, b"1234567890").await;

	let response = streamed(&app, Some("bytes=4-"), true).await;

	assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
	assert!(response.body().is_empty());
	assert_eq!(header_str(&response, header::CONTENT_LENGTH), Some("6"));
	assert_eq!(header_str(&response, STREAM_HEADER), None);
}
