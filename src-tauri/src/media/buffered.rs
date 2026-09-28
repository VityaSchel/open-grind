use grindr::{MediaFetcher, MediaResponse};
use tauri::http::{Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime};

use super::cache::{cache_key, CachedMedia};
use super::failures::MediaFailure;
use super::range::deliver_ranged;
use super::response::{deliverable_status, Freshness};
use super::stream::serve_streamed;
use super::target::host_of;
use super::upstream::{
	deliver_upstream, detail_of, fetch, refusal, serve_windowed, Fallback,
	FetchError,
};
use super::{MediaProxy, STREAMING_PLATFORM};

pub async fn serve_buffered<R: Runtime>(
	app: &AppHandle<R>,
	url: &str,
	fetcher: MediaFetcher,
	range: Option<&str>,
	is_head: bool,
) -> Response<Vec<u8>> {
	let freshness = Freshness::of(url);
	let key = cache_key(url).to_owned();
	let proxy = app.state::<MediaProxy>();

	if let Some(hit) = proxy.cached(&key).await {
		return deliver_ranged(&hit, range, is_head, freshness);
	}
	if proxy.windowed.lock().await.contains(&key) {
		return serve_windowed(app, url, fetcher, range, is_head).await;
	}

	let flight = proxy.flights.acquire(&key).await;
	if let Some(hit) = proxy.cached(&key).await {
		return deliver_ranged(&hit, range, is_head, freshness);
	}
	if proxy.windowed.lock().await.contains(&key) {
		drop(flight);
		return serve_windowed(app, url, fetcher, range, is_head).await;
	}

	let fetched = match fetch(app, url, fetcher, None).await {
		Ok(fetched) => fetched,
		Err(error) => {
			return match Fallback::pick(STREAMING_PLATFORM, &error, fetcher) {
				Fallback::Stream if !is_head => {
					drop(flight);
					serve_streamed(app, url, fetcher, range).await
				}
				Fallback::Window => {
					tracing::warn!(
						"[media] {} falls back to windowed: {}",
						host_of(url),
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
					serve_windowed(app, url, fetcher, range, is_head).await
				}
				Fallback::Stream | Fallback::Refuse => {
					let failure = MediaFailure::of_error(&error, url);
					proxy.failures.lock().await.record(&key, failure);
					refusal(error, url)
				}
			};
		}
	};

	settle(&proxy, &key, url, fetched, range, is_head).await
}

pub async fn settle(
	proxy: &MediaProxy,
	key: &str,
	url: &str,
	fetched: MediaResponse,
	range: Option<&str>,
	is_head: bool,
) -> Response<Vec<u8>> {
	if deliverable_status(fetched.status) == Some(StatusCode::OK) {
		let media = CachedMedia {
			content_type: fetched.content_type,
			body: fetched.body,
		};
		proxy.cache.lock().await.put(key, media.clone());
		proxy.failures.lock().await.forget(key);
		return deliver_ranged(&media, range, is_head, Freshness::of(url));
	}
	let failure = MediaFailure::of_status(fetched.status, url);
	proxy.failures.lock().await.record(key, failure);
	deliver_upstream(fetched, is_head)
}
