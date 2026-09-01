mod cache;
mod flight;
mod range;
mod response;
mod target;
mod upstream;
mod windowed;

use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::{
	AppHandle, Manager, Runtime, UriSchemeContext, UriSchemeResponder,
};
use tokio::sync::{Mutex, Semaphore};

use cache::{cache_key, CachedMedia, MediaCache};
use flight::Flights;
use range::deliver_ranged;
use response::{deliverable_status, refused, Freshness};
use target::{decode_target, host_of, Target};
use upstream::{
	deliver_upstream, detail_of, fetch, refusal, serve_windowed, windowable,
	FetchError,
};
use windowed::Windowed;

pub const SCHEME: &str = "ogmedia";

const MAX_MEDIA_BYTES: usize = 16 * 1024 * 1024;
const OFFICIAL_APP_REQUESTS_PER_HOST: usize = 20;

pub struct MediaProxy {
	cache: Mutex<MediaCache>,
	windowed: Mutex<Windowed>,
	flights: Flights,
	fetches: Semaphore,
}

impl Default for MediaProxy {
	fn default() -> Self {
		Self {
			cache: Mutex::default(),
			windowed: Mutex::default(),
			flights: Flights::default(),
			fetches: Semaphore::new(OFFICIAL_APP_REQUESTS_PER_HOST),
		}
	}
}

impl MediaProxy {
	async fn cached(&self, key: &str) -> Option<CachedMedia> {
		self.cache.lock().await.get(key)
	}

	pub async fn forget_everything(&self) {
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
	let freshness = Freshness::of(&url);
	let key = cache_key(&url).to_owned();
	let proxy = app.state::<MediaProxy>();

	if let Some(hit) = proxy.cached(&key).await {
		return deliver_ranged(&hit, range, is_head, freshness);
	}
	if proxy.windowed.lock().await.contains(&key) {
		return serve_windowed(app, &url, fetcher, range, is_head).await;
	}

	let flight = proxy.flights.acquire(&key).await;
	if let Some(hit) = proxy.cached(&key).await {
		return deliver_ranged(&hit, range, is_head, freshness);
	}
	if proxy.windowed.lock().await.contains(&key) {
		drop(flight);
		return serve_windowed(app, &url, fetcher, range, is_head).await;
	}

	let fetched = match fetch(app, &url, fetcher, None).await {
		Ok(fetched) => fetched,
		Err(error) if windowable(&error, fetcher) => {
			tracing::warn!(
				"[media] {} falls back to windowed: {}",
				host_of(&url),
				detail_of(&error)
			);
			let mut windowed = proxy.windowed.lock().await;
			if matches!(error, FetchError::Oversized) {
				windowed.always(key);
			} else {
				windowed.for_now(key);
			}
			drop(windowed);
			drop(flight);
			return serve_windowed(app, &url, fetcher, range, is_head).await;
		}
		Err(error) => return refusal(error, &url),
	};

	if deliverable_status(fetched.status) == Some(StatusCode::OK) {
		let media = CachedMedia {
			content_type: fetched.content_type,
			body: fetched.body,
		};
		proxy.cache.lock().await.put(&key, media.clone());
		return deliver_ranged(&media, range, is_head, freshness);
	}
	deliver_upstream(fetched, is_head)
}

#[cfg(test)]
mod tests {
	use std::sync::OnceLock;

	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

	use crate::state::AppState;

	use super::*;

	const PHOTO: &str = "https://cdns.grindr.com/images/thumb/320x320/ff";

	fn image(url: &str) -> Option<Target> {
		Some(Target {
			url: url.to_owned(),
			fetcher: grindr::MediaFetcher::ImageLoader,
		})
	}

	fn app_without_a_client() -> tauri::App<MockRuntime> {
		mock_builder()
			.manage(MediaProxy::default())
			.manage(AppState {
				client: OnceLock::new(),
			})
			.build(mock_context(noop_assets()))
			.expect("mock app")
	}

	async fn cache(
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
}
