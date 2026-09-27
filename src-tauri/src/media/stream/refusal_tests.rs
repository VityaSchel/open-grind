use tauri::http::StatusCode;

use super::super::registry::{unregister_stream, with_stream, STREAM_HEADER};
use super::super::tests::{app_without_a_client, header_str};
use super::tests::{loaded_from, stream_id, streamed, VIDEO};
use super::*;

#[tokio::test]
async fn a_streamed_request_without_a_client_is_refused_outright_at_zero() {
	let app = app_without_a_client();

	let response = streamed(&app, None, false).await;

	assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
	assert_eq!(header_str(&response, STREAM_HEADER), None);
}

#[tokio::test]
async fn a_streamed_seek_without_a_client_is_refused_through_an_empty_stream() {
	let app = app_without_a_client();

	let response = streamed(&app, Some("bytes=4-"), false).await;

	assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
	let id = stream_id(&response);
	assert_eq!(loaded_from(id, 4).await, (5, 4, Vec::new()));
	unregister_stream(id);
}

#[test]
fn a_stream_that_never_opens_at_zero_fails_the_load_at_once() {
	let response =
		unreachable(VIDEO, &Requested::Whole, "no headers".to_owned());

	assert_eq!(response.status(), StatusCode::GATEWAY_TIMEOUT);
	assert_eq!(header_str(&response, STREAM_HEADER), None);
}

#[test]
fn a_stream_that_never_opens_past_zero_answers_with_a_poisoned_stream() {
	let response =
		unreachable(VIDEO, &Requested::From(9), "no headers".to_owned());

	assert_eq!(response.status(), StatusCode::OK);
	let id = stream_id(&response);
	let error = with_stream(id, |stream| stream.available())
		.expect_err("a poisoned stream refuses to size itself");
	assert_ne!(error.kind(), std::io::ErrorKind::NotFound);
	unregister_stream(id);
}
