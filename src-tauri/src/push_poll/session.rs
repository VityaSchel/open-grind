use grindr::{GrindrClient, Method};
use serde_json::Value;

use super::{poll, Inbox, Poll, Watermarks};
use crate::state;
use crate::storage::{AuthStorage, DeviceStorage};

const TAPS: &str = "/v2/taps/received";

pub fn client() -> Option<GrindrClient> {
	if let Some(running) = state::shared() {
		return Some(running);
	}
	let credentials = AuthStorage::get_credentials().ok().flatten()?;
	let session = grindr::Session {
		credentials,
		token: None,
	};
	let built =
		GrindrClient::new(DeviceStorage::load_or_create(), Some(session))
			.inspect_err(|e| tracing::warn!("[poll] no client: {e}"))
			.ok()?;
	Some(state::share(|| built))
}

pub async fn collect(client: &GrindrClient, since: Watermarks) -> Poll {
	let me = client
		.session_receiver()
		.borrow()
		.as_ref()
		.and_then(|session| session.credentials.profile_id.clone());
	let inbox = inbox(client, since.inbox).await;
	let taps = fetch(client, Method::GET, TAPS).await;
	poll(inbox.as_ref(), taps.as_ref(), since, me.as_deref())
}

async fn inbox(client: &GrindrClient, watermark: i64) -> Option<Inbox> {
	let mut inbox = Inbox::default();
	let mut next = Some(1);
	while let Some(number) = next {
		let path = format!("/v4/inbox?page={number}");
		let page = fetch(client, Method::POST, &path).await?;
		next = inbox.read(&page, watermark);
	}
	Some(inbox)
}

async fn fetch(
	client: &GrindrClient,
	method: Method,
	path: &str,
) -> Option<Value> {
	let response = client
		.request(method, path)
		.send()
		.await
		.inspect_err(|e| tracing::warn!("[poll] {path} failed: {e}"))
		.ok()?;
	let json = (200..300)
		.contains(&response.status)
		.then(|| serde_json::from_slice(&response.body).ok())
		.flatten();
	if json.is_none() {
		tracing::warn!("[poll] {path} answered {}", response.status);
	}
	json
}
