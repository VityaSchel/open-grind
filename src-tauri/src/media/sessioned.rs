use std::collections::HashMap;
use std::sync::{Arc, Mutex as SyncMutex, PoisonError};
use std::time::{Duration, Instant};

use grindr::MediaFetcher;
use tauri::async_runtime::JoinHandle;
use tauri::http::{header, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::Mutex;

use super::cache::cache_key;
use super::requested::Requested;
use super::response::{refused, Freshness, RANGE_WINDOW_BYTES};
use super::session::{
	Failure, Opened, Opener, Piece, Session, OPENING_RELEASES_IDLE,
};
use super::stream::{answer, open, Answer, Head, Source};
use super::target::host_of;
use super::upstream::refusal_detail;
use super::{MediaProxy, RETRIED_HEADERS_DEADLINE};

const SESSIONS: usize = 4;
const IDLE: Duration = Duration::from_secs(20);
const OPEN_DEADLINE: Duration = RETRIED_HEADERS_DEADLINE;
const WHOLE_ANSWERS_UP_TO: u64 = RANGE_WINDOW_BYTES;

type Shared = Arc<Mutex<Session<Source>>>;

struct Held {
	session: Shared,
	used: Instant,
	reaper: Option<JoinHandle<()>>,
}

#[derive(Default)]
pub struct Sessions(SyncMutex<HashMap<String, Held>>);

impl Sessions {
	fn held(&self) -> std::sync::MutexGuard<'_, HashMap<String, Held>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn session(&self, key: &str) -> Shared {
		let mut held = self.held();
		if !held.contains_key(key) && held.len() >= SESSIONS {
			let idlest = held
				.iter()
				.filter(|(_, held)| Arc::strong_count(&held.session) == 1)
				.min_by_key(|(_, held)| held.used)
				.map(|(key, _)| key.clone());
			if let Some(reaper) =
				idlest.and_then(|key| held.remove(&key)?.reaper)
			{
				reaper.abort();
			}
		}
		let entry = held.entry(key.to_owned()).or_insert_with(|| Held {
			session: Shared::default(),
			used: Instant::now(),
			reaper: None,
		});
		entry.used = Instant::now();
		Arc::clone(&entry.session)
	}

	fn forget_when_idle<R: Runtime>(&self, app: &AppHandle<R>, key: &str) {
		let app = app.clone();
		let owned = key.to_owned();
		let reaper = tauri::async_runtime::spawn(async move {
			tokio::time::sleep(IDLE).await;
			let sessions = &app.state::<MediaProxy>().sessions;
			let mut held = sessions.held();
			let idle = held.get(&owned).is_some_and(|held| {
				Arc::strong_count(&held.session) == 1
					&& held.used.elapsed() >= IDLE
			});
			if idle {
				held.remove(&owned);
			}
		});
		if let Some(held) = self.held().get_mut(key) {
			if let Some(previous) = held.reaper.replace(reaper) {
				previous.abort();
			}
		}
	}

	pub fn unblock(&self) {
		let sessions: Vec<Shared> = self
			.held()
			.values()
			.map(|held| Arc::clone(&held.session))
			.collect();
		for session in sessions {
			if let Ok(mut session) = session.try_lock() {
				session.release_idle(OPENING_RELEASES_IDLE);
			}
		}
	}

	pub fn clear(&self) {
		for (_, held) in self.held().drain() {
			if let Some(reaper) = held.reaper {
				reaper.abort();
			}
		}
	}
}

struct Upstream<'a, R: Runtime> {
	app: &'a AppHandle<R>,
	url: &'a str,
	fetcher: MediaFetcher,
}

impl<R: Runtime> Opener for Upstream<'_, R> {
	type Chunks = Source;

	async fn open(&self, from: u64) -> Result<Opened<Source>, Failure> {
		let requested = Requested::From(from);
		let opening = open(self.app, self.url, self.fetcher, &requested);
		let (permit, stream) =
			match tokio::time::timeout(OPEN_DEADLINE, opening).await {
				Ok(Ok(opened)) => opened,
				Ok(Err(error)) => {
					return Err(match refusal_detail(error) {
						Err(status) => Failure::Refused(status.as_u16()),
						Ok(failure)
							if failure.status
								== StatusCode::GATEWAY_TIMEOUT =>
						{
							Failure::TimedOut(failure.detail)
						}
						Ok(failure) => Failure::Upstream(failure.detail),
					})
				}
				Err(_) => {
					return Err(Failure::TimedOut(format!(
						"no headers within {OPEN_DEADLINE:?}"
					)))
				}
			};
		match answer(&Head::of_stream(&stream), &requested) {
			Answer::Stream { placement, .. } => Ok(Opened {
				total: (placement.length > 0).then_some(placement.length),
				content_type: stream.content_type.clone(),
				skip: from - placement.origin,
				chunks: Source::Live(Box::new(stream)),
				permit: Some(permit),
			}),
			Answer::Refuse { status, .. } => Err(Failure::Refused(status)),
			Answer::Poison => {
				Err(Failure::Upstream("unsized answer to a seek".to_owned()))
			}
		}
	}

	fn unblock(&self) {
		self.app.state::<MediaProxy>().sessions.unblock();
	}
}

fn span(requested: Requested, total: Option<u64>) -> Option<(u64, u64)> {
	match requested {
		Requested::Whole => Some((0, u64::MAX)),
		Requested::From(first) => Some((first, u64::MAX)),
		Requested::Closed { first, last } => Some((first, last - first + 1)),
		Requested::Suffix(tail) => {
			total.map(|total| (total.saturating_sub(tail), tail.min(total)))
		}
	}
}

pub fn answers_whole(requested: Requested) -> bool {
	span(requested, None)
		.is_some_and(|(_, length)| length <= WHOLE_ANSWERS_UP_TO)
}

pub async fn serve_sessioned<R: Runtime>(
	app: &AppHandle<R>,
	url: &str,
	fetcher: MediaFetcher,
	range: Option<&str>,
	is_head: bool,
) -> Response<Vec<u8>> {
	let requested = Requested::parse(range);
	let key = cache_key(url).to_owned();
	let sessions = &app.state::<MediaProxy>().sessions;
	let shared = sessions.session(&key);
	let upstream = Upstream { app, url, fetcher };
	let (read, total) = {
		let mut session = shared.lock().await;
		if session.total().is_none()
			&& matches!(requested, Requested::Suffix(_))
		{
			let _ = session.read(&upstream, 0, 1).await;
		}
		let read = match span(requested, session.total()) {
			Some((first, length)) => {
				session
					.read(&upstream, first, length.min(RANGE_WINDOW_BYTES))
					.await
			}
			None => Err(Failure::Refused(416)),
		};
		(read, session.total())
	};
	drop(shared);
	sessions.forget_when_idle(app, &key);
	match read {
		Ok(piece) => answered(piece, is_head),
		Err(Failure::Refused(416)) => unsatisfiable(total),
		Err(Failure::Refused(status)) => refused(
			StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY),
		),
		Err(Failure::Upstream(detail)) => {
			tracing::warn!(
				"[media] video read failed for {}: {detail}",
				host_of(url)
			);
			refused(StatusCode::BAD_GATEWAY)
		}
		Err(Failure::TimedOut(detail)) => {
			tracing::warn!(
				"[media] video read timed out for {}: {detail}",
				host_of(url)
			);
			refused(StatusCode::GATEWAY_TIMEOUT)
		}
	}
}

fn answered(piece: Piece, is_head: bool) -> Response<Vec<u8>> {
	let last = piece.first + piece.bytes.len() as u64 - 1;
	let total = piece
		.total
		.map_or_else(|| "*".to_owned(), |total| total.to_string());
	Response::builder()
		.status(StatusCode::PARTIAL_CONTENT)
		.header(
			header::CONTENT_TYPE,
			piece
				.content_type
				.as_deref()
				.unwrap_or("application/octet-stream"),
		)
		.header(header::CONTENT_LENGTH, piece.bytes.len())
		.header(
			header::CONTENT_RANGE,
			format!("bytes {}-{last}/{total}", piece.first),
		)
		.header(header::ACCEPT_RANGES, "bytes")
		.header(header::CACHE_CONTROL, Freshness::Uncacheable.directive())
		.body(if is_head { Vec::new() } else { piece.bytes })
		.unwrap_or_else(|_| refused(StatusCode::INTERNAL_SERVER_ERROR))
}

fn unsatisfiable(total: Option<u64>) -> Response<Vec<u8>> {
	let mut response = refused(StatusCode::RANGE_NOT_SATISFIABLE);
	if let Some(value) =
		total.and_then(|total| format!("bytes */{total}").parse().ok())
	{
		response.headers_mut().insert(header::CONTENT_RANGE, value);
	}
	response
}
