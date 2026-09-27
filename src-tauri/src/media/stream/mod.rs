mod adapter;
mod answer;
mod fault;
#[cfg(test)]
mod lifecycle_tests;
mod open;
mod pump;
#[cfg(test)]
mod refusal_tests;
mod reply;
#[cfg(test)]
mod scripted;
#[cfg(test)]
mod tests;

use std::time::Duration;

use grindr::MediaFetcher;
use tauri::http::Response;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::{mpsc, oneshot, OwnedSemaphorePermit};

use super::cache::{cache_key, CachedMedia};
use super::registry::register_stream;
use super::requested::Requested;
use super::upstream::refusal_detail;
use super::MediaProxy;
use adapter::{WebViewStream, CHANNEL_SLOTS};
pub use answer::{answer, Answer, Head};
pub use fault::Fault;
pub use open::open;
use pump::{run, tee_capacity, Outcome, Pump, IDLE};
pub use pump::{Chunks, Source};
use reply::{deny, poison, refuse, streamed, unreachable, Streamed};

const HEAD_DEADLINE: Duration = Duration::from_secs(25);

struct Opening {
	key: String,
	content_type: Option<String>,
	head: Head,
	source: Source,
	permit: Option<OwnedSemaphorePermit>,
}

pub async fn serve_streamed<R: Runtime>(
	app: &AppHandle<R>,
	url: &str,
	fetcher: MediaFetcher,
	range: Option<&str>,
) -> Response<Vec<u8>> {
	let requested = Requested::parse(range);
	let at = requested.start();
	let key = cache_key(url).to_owned();
	if let Some(hit) = app.state::<MediaProxy>().cached(&key).await {
		let opening = Opening {
			key,
			content_type: hit.content_type,
			head: Head::of_cached(hit.body.len()),
			source: Source::Cached(hit.body),
			permit: None,
		};
		return respond(app, opening, &requested).await;
	}
	let opened = open(app, url, fetcher, &requested);
	match tokio::time::timeout(HEAD_DEADLINE, opened).await {
		Ok(Ok((permit, stream))) => {
			let opening = Opening {
				key,
				content_type: stream.content_type.clone(),
				head: Head::of_stream(&stream),
				source: Source::Live(Box::new(stream)),
				permit: Some(permit),
			};
			respond(app, opening, &requested).await
		}
		Ok(Err(error)) => match refusal_detail(error) {
			Err(status) => deny(status, at),
			Ok(detail) => unreachable(url, &requested, detail),
		},
		Err(_) => unreachable(
			url,
			&requested,
			format!("no headers within {HEAD_DEADLINE:?}"),
		),
	}
}

async fn respond<R: Runtime>(
	app: &AppHandle<R>,
	opening: Opening,
	requested: &Requested,
) -> Response<Vec<u8>> {
	match answer(&opening.head, requested) {
		Answer::Stream {
			status,
			content_range,
			placement,
		} => {
			let (tx, rx) = mpsc::channel(CHANNEL_SLOTS);
			let (cancel, cancelled) = oneshot::channel();
			let id = register_stream(Box::new(WebViewStream::streaming(
				rx, cancel, placement,
			)));
			let tee = match opening.source {
				Source::Live(_) => tee_capacity(placement),
				Source::Cached(_) => None,
			};
			let pump = Pump {
				id,
				source: opening.source,
				tx,
				cancel: cancelled,
				permit: opening.permit,
				tee,
				idle: IDLE,
			};
			launch(app, opening.key, opening.content_type.clone(), pump).await;
			streamed(Streamed {
				id,
				status,
				content_type: opening.content_type,
				content_range,
				length: (placement.length > 0)
					.then(|| placement.length - requested.start()),
			})
		}
		Answer::Refuse { status, at } => refuse(status, at),
		Answer::Poison => poison(),
	}
}

async fn launch<R: Runtime, C: Chunks + 'static>(
	app: &AppHandle<R>,
	key: String,
	content_type: Option<String>,
	pump: Pump<C>,
) {
	let proxy = app.state::<MediaProxy>();
	let mut pumps = proxy.pumps.lock().await;
	let id = pump.id;
	let app = app.clone();
	let handle = tauri::async_runtime::spawn(async move {
		let outcome = run(pump).await;
		let proxy = app.state::<MediaProxy>();
		if let Outcome::Finished(Some(body)) = outcome {
			proxy
				.cache
				.lock()
				.await
				.put(&key, CachedMedia { content_type, body });
		}
		proxy.pumps.lock().await.remove(&id);
	});
	pumps.insert(id, handle);
}
