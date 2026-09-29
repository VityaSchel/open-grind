mod buffered;
mod cache;
#[cfg(target_os = "linux")]
mod element;
mod failures;
mod flight;
mod range;
mod registry;
mod requested;
mod response;
mod session;
mod sessioned;
mod stream;
mod target;
mod upstream;
mod windowed;

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use grindr::MediaFetcher;
use tauri::async_runtime::JoinHandle;
use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::{
	AppHandle, Manager, Runtime, UriSchemeContext, UriSchemeResponder,
};
use tokio::sync::{Mutex, Semaphore};

use buffered::serve_buffered;
use cache::{cache_key, CachedMedia, MediaCache};
use failures::{target_path_of, Failures, MediaFailure};
use flight::Flights;
use registry::unregister_stream;
use requested::Requested;
use response::refused;
use sessioned::{answers_whole, serve_sessioned, Sessions};
use stream::serve_streamed;
use target::{decode_target, Target};
use windowed::Windowed;

#[cfg(target_os = "linux")]
pub use element::{serve_element_opens, WEBKIT_EXTENSIONS};

pub const SCHEME: &str = "ogmedia";

const MAX_MEDIA_BYTES: usize = 16 * 1024 * 1024;
const OFFICIAL_APP_REQUESTS_PER_HOST: usize = 20;
const STREAMING_PLATFORM: bool = cfg!(target_os = "android");
const ANDROID_ANSWER_DEADLINE: Duration = Duration::from_secs(25);
const RETRIED_HEADERS_DEADLINE: Duration = Duration::from_secs(45);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Host {
	AndroidWebView,
	WkWebView,
	WholeBodies,
}

const HOST: Host = if cfg!(target_os = "android") {
	Host::AndroidWebView
} else if cfg!(target_os = "macos") {
	Host::WkWebView
} else {
	Host::WholeBodies
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Delivery {
	Buffered,
	Streamed,
	Sessioned,
}

impl Delivery {
	fn pick(host: Host, fetcher: MediaFetcher, range: Option<&str>) -> Self {
		let video = fetcher == MediaFetcher::MediaPlayer;
		match host {
			Host::AndroidWebView if video || range.is_some() => Self::Streamed,
			Host::WkWebView
				if video && !answers_whole(Requested::parse(range)) =>
			{
				Self::Streamed
			}
			Host::WkWebView | Host::WholeBodies if video => Self::Sessioned,
			_ => Self::Buffered,
		}
	}
}

pub struct MediaProxy {
	cache: Mutex<MediaCache>,
	windowed: Mutex<Windowed>,
	failures: Mutex<Failures>,
	flights: Flights,
	fetches: Arc<Semaphore>,
	pumps: Mutex<HashMap<u64, JoinHandle<()>>>,
	sessions: Sessions,
}

impl Default for MediaProxy {
	fn default() -> Self {
		Self {
			cache: Mutex::default(),
			windowed: Mutex::default(),
			failures: Mutex::default(),
			flights: Flights::default(),
			fetches: Arc::new(Semaphore::new(OFFICIAL_APP_REQUESTS_PER_HOST)),
			pumps: Mutex::default(),
			sessions: Sessions::default(),
		}
	}
}

impl MediaProxy {
	async fn cached(&self, key: &str) -> Option<CachedMedia> {
		self.cache.lock().await.get(key)
	}

	pub async fn forget_everything(&self) {
		let pumps: Vec<_> = self.pumps.lock().await.drain().collect();
		for (id, pump) in pumps {
			pump.abort();
			unregister_stream(id);
		}
		self.sessions.clear();
		self.cache.lock().await.clear();
		self.windowed.lock().await.clear();
		self.failures.lock().await.clear();
		self.flights.clear().await;
	}

	async fn failure_of(&self, src: &str) -> Option<MediaFailure> {
		let Target { url, .. } = decode_target(target_path_of(src)?)?;
		self.failures.lock().await.get(cache_key(&url))
	}
}

#[tauri::command]
pub async fn media_failure(
	app: AppHandle,
	src: String,
) -> Option<MediaFailure> {
	app.state::<MediaProxy>().failure_of(&src).await
}

pub fn handle<R: Runtime>(
	context: UriSchemeContext<'_, R>,
	request: Request<Vec<u8>>,
	responder: UriSchemeResponder,
) {
	let app = context.app_handle().clone();
	let is_head = request.method() == Method::HEAD;
	let allowed_method = is_head || request.method() == Method::GET;
	let target = decode_target(request.uri().path());
	let range = request
		.headers()
		.get(header::RANGE)
		.and_then(|value| value.to_str().ok())
		.map(str::to_owned);

	tauri::async_runtime::spawn(async move {
		let response = if allowed_method {
			serve(&app, target, range, is_head).await
		} else {
			refused(StatusCode::METHOD_NOT_ALLOWED)
		};
		responder.respond(response);
	});
}

async fn serve<R: Runtime>(
	app: &AppHandle<R>,
	target: Option<Target>,
	range: Option<String>,
	is_head: bool,
) -> Response<Vec<u8>> {
	let Some(Target { url, fetcher }) = target else {
		return refused(StatusCode::BAD_REQUEST);
	};
	let range = range.as_deref();
	let delivery = Delivery::pick(HOST, fetcher, range);
	serve_by(delivery, app, &url, fetcher, range, is_head).await
}

async fn serve_by<R: Runtime>(
	delivery: Delivery,
	app: &AppHandle<R>,
	url: &str,
	fetcher: MediaFetcher,
	range: Option<&str>,
	is_head: bool,
) -> Response<Vec<u8>> {
	match delivery {
		Delivery::Streamed if !is_head => {
			serve_streamed(app, url, fetcher, range).await
		}
		Delivery::Sessioned => {
			serve_sessioned(app, url, fetcher, range, is_head).await
		}
		Delivery::Streamed | Delivery::Buffered => {
			serve_buffered(app, url, fetcher, range, is_head).await
		}
	}
}

#[cfg(test)]
mod tests {
	use std::sync::OnceLock;

	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
	use tauri::Manager;

	use crate::state::AppState;

	use super::cache::cache_key;
	use super::*;

	const PHOTO: &str = "https://cdns.grindr.com/images/thumb/320x320/ff";

	fn image(url: &str) -> Option<Target> {
		Some(Target {
			url: url.to_owned(),
			fetcher: grindr::MediaFetcher::ImageLoader,
		})
	}

	pub(super) fn app_without_a_client() -> tauri::App<MockRuntime> {
		mock_builder()
			.manage(MediaProxy::default())
			.manage(AppState {
				client: OnceLock::new(),
			})
			.build(mock_context(noop_assets()))
			.expect("mock app")
	}

	pub(super) async fn cache(
		app: &tauri::App<MockRuntime>,
		url: &str,
		body: &'static [u8],
	) {
		app.state::<MediaProxy>().cache.lock().await.put(
			cache_key(url),
			CachedMedia {
				content_type: Some("image/webp".to_owned()),
				body: grindr::Bytes::from_static(body),
			},
		);
	}

	pub(super) fn header_str(
		response: &Response<Vec<u8>>,
		name: impl header::AsHeaderName,
	) -> Option<&str> {
		response.headers().get(name).and_then(|v| v.to_str().ok())
	}

	const VIDEO_URL: &str =
		"https://d3.cloudfront.net/v.mp4?Expires=1&Signature=S";
	const TWO_HEADER_WAITS: Duration = Duration::from_secs(40);

	async fn assert_waits_out_a_retried_header_wait(delivery: Delivery) {
		let app = app_without_a_client();
		let slots = Arc::clone(&app.state::<MediaProxy>().fetches);
		let _taken = slots
			.acquire_many_owned(OFFICIAL_APP_REQUESTS_PER_HOST as u32)
			.await
			.unwrap();
		let started = tokio::time::Instant::now();
		let opening = serve_by(
			delivery,
			app.handle(),
			VIDEO_URL,
			grindr::MediaFetcher::MediaPlayer,
			None,
			false,
		);
		tokio::pin!(opening);

		let early = tokio::time::timeout(TWO_HEADER_WAITS, &mut opening).await;

		assert!(
			early.is_err(),
			"{delivery:?} gave up during the crate's retry"
		);
		assert_eq!(opening.await.status(), StatusCode::GATEWAY_TIMEOUT);
		assert!(started.elapsed() >= RETRIED_HEADERS_DEADLINE);
	}

	#[tokio::test(start_paused = true)]
	async fn a_desktop_video_stream_waits_out_a_retried_header_wait() {
		assert_waits_out_a_retried_header_wait(Delivery::Streamed).await;
	}

	#[tokio::test(start_paused = true)]
	async fn a_desktop_video_session_waits_out_a_retried_header_wait() {
		assert_waits_out_a_retried_header_wait(Delivery::Sessioned).await;
	}

	#[tokio::test]
	async fn a_cached_url_is_served_without_reaching_the_client() {
		let app = app_without_a_client();
		cache(&app, PHOTO, b"webpbytes").await;

		let response = serve(app.handle(), image(PHOTO), None, false).await;

		assert_eq!(response.status(), StatusCode::OK);
		assert_eq!(response.body().as_slice(), b"webpbytes");
		assert_eq!(
			response.headers().get(header::CONTENT_TYPE).unwrap(),
			"image/webp"
		);
		assert_eq!(
			response.headers().get(header::CACHE_CONTROL).unwrap(),
			"private, max-age=604800, immutable"
		);
	}

	#[tokio::test]
	async fn a_signed_body_is_never_left_in_the_webview_store() {
		let signed = "https://d3.cloudfront.net/a.jpg?Expires=1&Signature=OLD";
		let app = app_without_a_client();
		cache(&app, signed, b"jpegbytes").await;

		let response = serve(app.handle(), image(signed), None, false).await;

		assert_eq!(response.status(), StatusCode::OK);
		assert_eq!(
			response.headers().get(header::CACHE_CONTROL).unwrap(),
			"no-store"
		);
	}

	#[tokio::test]
	async fn a_rotated_signature_hits_what_the_previous_one_stored() {
		let app = app_without_a_client();
		cache(
			&app,
			"https://d3.cloudfront.net/a.jpg?Expires=1&Signature=OLD",
			b"jpegbytes",
		)
		.await;

		let response = serve(
			app.handle(),
			image("https://d3.cloudfront.net/a.jpg?Expires=2&Signature=NEW"),
			None,
			false,
		)
		.await;

		assert_eq!(response.status(), StatusCode::OK);
		assert_eq!(response.body().as_slice(), b"jpegbytes");
	}

	#[tokio::test]
	async fn a_request_arriving_before_the_client_exists_is_refused() {
		let app = app_without_a_client();

		let response = serve(app.handle(), image(PHOTO), None, false).await;

		assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
		assert!(response.body().is_empty());
	}

	#[tokio::test]
	async fn a_ranged_request_is_sliced_out_of_the_cached_body() {
		let app = app_without_a_client();
		cache(&app, PHOTO, b"whole").await;

		let response = serve(
			app.handle(),
			image(PHOTO),
			Some("bytes=0-1".to_owned()),
			false,
		)
		.await;

		assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
		assert_eq!(response.body().as_slice(), b"wh");
		assert_eq!(
			response.headers().get(header::CONTENT_RANGE).unwrap(),
			"bytes 0-1/5"
		);
	}

	#[tokio::test]
	async fn a_seek_into_the_cached_body_needs_no_network() {
		let app = app_without_a_client();
		cache(&app, PHOTO, b"whole").await;

		let response = serve(
			app.handle(),
			image(PHOTO),
			Some("bytes=2-".to_owned()),
			false,
		)
		.await;

		assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
		assert_eq!(response.body().as_slice(), b"ole");
		assert_eq!(
			response.headers().get(header::CONTENT_RANGE).unwrap(),
			"bytes 2-4/5"
		);
	}

	#[tokio::test]
	async fn an_uncached_ranged_request_still_needs_the_client() {
		let app = app_without_a_client();

		let response = serve(
			app.handle(),
			image(PHOTO),
			Some("bytes=0-1".to_owned()),
			false,
		)
		.await;

		assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
	}

	#[tokio::test]
	async fn forgetting_everything_leaves_no_trace_of_what_was_fetched() {
		let app = app_without_a_client();
		let proxy = app.state::<MediaProxy>();
		cache(&app, PHOTO, b"webpbytes").await;
		proxy.windowed.lock().await.always(PHOTO.to_owned());
		proxy
			.failures
			.lock()
			.await
			.record(PHOTO, MediaFailure::of_status(502, PHOTO));
		drop(proxy.flights.acquire(PHOTO).await);

		proxy.forget_everything().await;

		assert!(proxy.cache.lock().await.get(PHOTO).is_none());
		assert!(proxy.windowed.lock().await.is_empty());
		assert!(proxy.failures.lock().await.is_empty());
		assert!(proxy.flights.is_empty().await);
	}

	fn ogmedia_src(url: &str) -> String {
		use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
		format!("http://ogmedia.localhost/i{}", URL_SAFE_NO_PAD.encode(url))
	}

	fn upstream(status: u16) -> grindr::MediaResponse {
		grindr::MediaResponse {
			status,
			content_type: Some("image/jpeg".to_owned()),
			content_range: None,
			accept_ranges: None,
			body: grindr::Bytes::from_static(b"jpegbytes"),
		}
	}

	#[tokio::test]
	async fn a_refused_signature_is_remembered_for_its_renewal_until_a_load_succeeds(
	) {
		let old = "https://d3.cloudfront.net/a.jpg?Expires=1&Signature=OLD";
		let renewed = "https://d3.cloudfront.net/a.jpg?Expires=2&Signature=NEW";
		let app = app_without_a_client();
		let proxy = app.state::<MediaProxy>();

		buffered::settle(
			&proxy,
			cache_key(old),
			old,
			upstream(403),
			None,
			false,
		)
		.await;
		let failure = proxy.failure_of(&ogmedia_src(renewed)).await;
		buffered::settle(
			&proxy,
			cache_key(renewed),
			renewed,
			upstream(200),
			None,
			false,
		)
		.await;

		assert_eq!(failure.and_then(|failure| failure.status), Some(403));
		assert!(proxy.failure_of(&ogmedia_src(renewed)).await.is_none());
	}

	#[tokio::test]
	async fn a_refused_image_leaves_its_failure_for_the_page_to_read() {
		let app = app_without_a_client();
		let src = format!("{}?retry=1", ogmedia_src(PHOTO));

		serve(app.handle(), image(PHOTO), None, false).await;
		let failure = app.state::<MediaProxy>().failure_of(&src).await;

		assert_eq!(
			failure.map(|failure| (failure.kind, failure.host)),
			Some((
				failures::FailureKind::NotReady,
				"cdns.grindr.com".to_owned()
			))
		);
	}

	#[tokio::test]
	async fn an_undecodable_target_is_refused_before_anything_else() {
		let app = app_without_a_client();

		let response = serve(app.handle(), None, None, false).await;

		assert_eq!(response.status(), StatusCode::BAD_REQUEST);
	}

	const VIDEO: MediaFetcher = MediaFetcher::MediaPlayer;
	const IMAGE: MediaFetcher = MediaFetcher::ImageLoader;

	#[test]
	fn android_streams_every_video_and_every_seek() {
		let host = Host::AndroidWebView;

		assert_eq!(Delivery::pick(host, VIDEO, None), Delivery::Streamed);
		assert_eq!(
			Delivery::pick(host, IMAGE, Some("bytes=0-")),
			Delivery::Streamed
		);
		assert_eq!(Delivery::pick(host, IMAGE, None), Delivery::Buffered);
	}

	#[test]
	fn a_wkwebview_video_read_small_enough_to_answer_whole_uses_a_session() {
		let host = Host::WkWebView;

		assert_eq!(
			Delivery::pick(host, VIDEO, Some("bytes=65536-131071")),
			Delivery::Sessioned
		);
		assert_eq!(
			Delivery::pick(host, VIDEO, Some("bytes=0-")),
			Delivery::Streamed
		);
		assert_eq!(Delivery::pick(host, VIDEO, None), Delivery::Streamed);
		assert_eq!(
			Delivery::pick(host, IMAGE, Some("bytes=0-")),
			Delivery::Buffered
		);
	}

	#[test]
	fn a_webview_taking_whole_bodies_reads_every_video_through_a_session() {
		let host = Host::WholeBodies;

		for range in [None, Some("bytes=0-"), Some("bytes=10-20")] {
			assert_eq!(Delivery::pick(host, VIDEO, range), Delivery::Sessioned);
		}
		assert_eq!(Delivery::pick(host, IMAGE, None), Delivery::Buffered);
	}
}
