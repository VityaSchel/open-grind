use grindr::{MediaFetcher, MediaStream, StreamRequest};
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::OwnedSemaphorePermit;

use super::super::requested::{upstream_range, Requested};
use super::super::upstream::{admit, FetchError};
use super::super::MediaProxy;

pub async fn open<R: Runtime>(
	app: &AppHandle<R>,
	url: &str,
	fetcher: MediaFetcher,
	requested: &Requested,
) -> Result<(OwnedSemaphorePermit, MediaStream), FetchError> {
	app.state::<MediaProxy>().sessions.unblock();
	let (permit, client) = admit(app).await?;
	let range = upstream_range(requested);
	let stream = client
		.stream_media(StreamRequest {
			url,
			range: range.as_deref(),
			fetcher,
		})
		.await
		.map_err(FetchError::Upstream)?;
	Ok((permit, stream))
}
