mod buffered;
mod cache;
mod flight;
mod range;
mod registry;
mod requested;
mod response;
mod stream;
mod target;
mod upstream;
mod windowed;

use std::collections::HashMap;
use std::sync::Arc;

use grindr::MediaFetcher;
use tauri::async_runtime::JoinHandle;
use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::{AppHandle, Runtime, UriSchemeContext, UriSchemeResponder};
use tokio::sync::{Mutex, Semaphore};

use buffered::serve_buffered;
use cache::{CachedMedia, MediaCache};
use flight::Flights;
use registry::unregister_stream;
use response::refused;
use stream::serve_streamed;
use target::{decode_target, Target};
use windowed::Windowed;

pub const SCHEME: &str = "ogmedia";

const MAX_MEDIA_BYTES: usize = 16 * 1024 * 1024;
const OFFICIAL_APP_REQUESTS_PER_HOST: usize = 20;
const STREAMING_PLATFORM: bool = cfg!(target_os = "android");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Delivery {
	Buffered,
	Streamed,
}

impl Delivery {
	fn pick(
		streaming_platform: bool,
		fetcher: MediaFetcher,
		range: Option<&str>,
	) -> Self {
		let plays_or_seeks =
			fetcher == MediaFetcher::MediaPlayer || range.is_some();
		if streaming_platform && plays_or_seeks {
			Self::Streamed
		} else {
			Self::Buffered
		}
	}
}

pub struct MediaProxy {
	cache: Mutex<MediaCache>,
	windowed: Mutex<Windowed>,
	flights: Flights,
	fetches: Arc<Semaphore>,
	pumps: Mutex<HashMap<u64, JoinHandle<()>>>,
}

impl Default for MediaProxy {
	fn default() -> Self {
		Self {
			cache: Mutex::default(),
			windowed: Mutex::default(),
			flights: Flights::default(),
			fetches: Arc::new(Semaphore::new(OFFICIAL_APP_REQUESTS_PER_HOST)),
			pumps: Mutex::default(),
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
		self.cache.lock().await.clear();
		self.windowed.lock().await.clear();
		self.flights.clear().await;
	}
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
	let delivery = Delivery::pick(STREAMING_PLATFORM, fetcher, range);
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
		Delivery::Streamed | Delivery::Buffered => {
			serve_buffered(app, url, fetcher, range, is_head).await
		}
	}
}

#[cfg(test)]
mod tests {
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
			.manage(AppState::default())
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
		drop(proxy.flights.acquire(PHOTO).await);

		proxy.forget_everything().await;

		assert!(proxy.cache.lock().await.get(PHOTO).is_none());
		assert!(proxy.windowed.lock().await.is_empty());
		assert!(proxy.flights.is_empty().await);
	}

	#[tokio::test]
	async fn an_undecodable_target_is_refused_before_anything_else() {
		let app = app_without_a_client();

		let response = serve(app.handle(), None, None, false).await;

		assert_eq!(response.status(), StatusCode::BAD_REQUEST);
	}

	#[test]
	fn only_a_video_or_a_seek_streams_and_only_on_a_streaming_platform() {
		let video = grindr::MediaFetcher::MediaPlayer;
		let image = grindr::MediaFetcher::ImageLoader;

		assert_eq!(Delivery::pick(true, video, None), Delivery::Streamed);
		assert_eq!(
			Delivery::pick(true, image, Some("bytes=0-")),
			Delivery::Streamed
		);
		assert_eq!(Delivery::pick(true, image, None), Delivery::Buffered);
		assert_eq!(
			Delivery::pick(false, video, Some("bytes=0-")),
			Delivery::Buffered
		);
	}
}
