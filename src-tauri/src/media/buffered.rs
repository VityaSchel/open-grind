use std::future::Future;
use std::time::Duration;

use grindr::{MediaFetcher, MediaResponse};
use tauri::http::{Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime};
use tokio::time::{timeout_at, Instant};

use super::cache::{cache_key, CachedMedia};
use super::failures::MediaFailure;
use super::range::deliver_ranged;
use super::response::{deliverable_status, refused, Freshness};
use super::stream::serve_streamed;
use super::target::host_of;
use super::upstream::{
	deliver_upstream, detail_of, fetch, refusal, serve_windowed, Fallback,
	FetchError,
};
use super::{MediaProxy, ANDROID_ANSWER_DEADLINE, STREAMING_PLATFORM};

pub async fn serve_buffered<R: Runtime>(
	app: &AppHandle<R>,
	url: &str,
	fetcher: MediaFetcher,
	range: Option<&str>,
	is_head: bool,
) -> Response<Vec<u8>> {
	let deadline = STREAMING_PLATFORM.then_some(ANDROID_ANSWER_DEADLINE);
	serve_buffered_within(app, url, fetcher, range, is_head, deadline).await
}

async fn serve_buffered_within<R: Runtime>(
	app: &AppHandle<R>,
	url: &str,
	fetcher: MediaFetcher,
	range: Option<&str>,
	is_head: bool,
	deadline: Option<Duration>,
) -> Response<Vec<u8>> {
	let until = deadline.map(|deadline| Instant::now() + deadline);
	let freshness = Freshness::of(url);
	let key = cache_key(url).to_owned();
	let proxy = app.state::<MediaProxy>();

	if let Some(hit) = proxy.cached(&key).await {
		return deliver_ranged(&hit, range, is_head, freshness);
	}
	if proxy.windowed.lock().await.contains(&key) {
		return serve_windowed(app, url, fetcher, range, is_head).await;
	}

	let Some(flight) = within(until, proxy.flights.acquire(&key)).await else {
		return late(&proxy, &key, url).await;
	};
	if let Some(hit) = proxy.cached(&key).await {
		return deliver_ranged(&hit, range, is_head, freshness);
	}
	if proxy.windowed.lock().await.contains(&key) {
		drop(flight);
		return serve_windowed(app, url, fetcher, range, is_head).await;
	}

	let fetched = match within(until, fetch(app, url, fetcher, None)).await {
		None => return late(&proxy, &key, url).await,
		Some(Ok(fetched)) => fetched,
		Some(Err(error)) => {
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

async fn within<F: Future>(
	until: Option<Instant>,
	work: F,
) -> Option<F::Output> {
	match until {
		Some(until) => timeout_at(until, work).await.ok(),
		None => Some(work.await),
	}
}

async fn late(proxy: &MediaProxy, key: &str, url: &str) -> Response<Vec<u8>> {
	tracing::warn!("[media] {} did not answer in time", host_of(url));
	proxy
		.failures
		.lock()
		.await
		.record(key, MediaFailure::late(url));
	refused(StatusCode::GATEWAY_TIMEOUT)
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

#[cfg(test)]
mod tests {
	use std::sync::Arc;
	use std::time::Duration;

	use grindr::MediaFetcher;
	use tauri::http::{Response, StatusCode};
	use tauri::test::MockRuntime;
	use tauri::{AppHandle, Manager};

	use super::super::cache::cache_key;
	use super::super::failures::FailureKind;
	use super::super::tests::app_without_a_client;
	use super::super::{MediaProxy, OFFICIAL_APP_REQUESTS_PER_HOST};
	use super::serve_buffered_within;

	const PHOTO: &str = "https://cdns.grindr.com/images/thumb/320x320/ff";
	const DEADLINE: Duration = Duration::from_secs(25);

	async fn serve(
		app: &AppHandle<MockRuntime>,
		deadline: Option<Duration>,
	) -> Response<Vec<u8>> {
		serve_buffered_within(
			app,
			PHOTO,
			MediaFetcher::ImageLoader,
			None,
			false,
			deadline,
		)
		.await
	}

	async fn assert_answered_as_a_timeout(app: &AppHandle<MockRuntime>) {
		let response =
			tokio::time::timeout(DEADLINE * 2, serve(app, Some(DEADLINE)))
				.await
				.expect("the deadline answers before the fetch does");

		assert_eq!(response.status(), StatusCode::GATEWAY_TIMEOUT);
		let failure = app
			.state::<MediaProxy>()
			.failures
			.lock()
			.await
			.get(cache_key(PHOTO))
			.expect("a recorded failure");
		assert_eq!((failure.kind, failure.phase), (FailureKind::Timeout, None));
	}

	#[tokio::test(start_paused = true)]
	async fn a_photo_queued_behind_the_same_fetch_times_out_at_the_deadline() {
		let app = app_without_a_client();
		let _other = app
			.state::<MediaProxy>()
			.flights
			.acquire(cache_key(PHOTO))
			.await;

		assert_answered_as_a_timeout(app.handle()).await;
	}

	#[tokio::test(start_paused = true)]
	async fn a_photo_waiting_for_a_fetch_slot_times_out_at_the_deadline() {
		let app = app_without_a_client();
		let slots = Arc::clone(&app.state::<MediaProxy>().fetches);
		let _taken = slots
			.acquire_many_owned(OFFICIAL_APP_REQUESTS_PER_HOST as u32)
			.await
			.unwrap();

		assert_answered_as_a_timeout(app.handle()).await;
	}

	#[tokio::test(start_paused = true)]
	async fn without_a_deadline_a_queued_photo_waits_its_turn() {
		let app = app_without_a_client();
		let other = app
			.state::<MediaProxy>()
			.flights
			.acquire(cache_key(PHOTO))
			.await;
		let handle = app.handle().clone();
		let waiting =
			tokio::spawn(async move { serve(&handle, None).await.status() });

		tokio::time::sleep(DEADLINE * 4).await;
		assert!(!waiting.is_finished());
		drop(other);

		assert_eq!(waiting.await.unwrap(), StatusCode::SERVICE_UNAVAILABLE);
	}
}
