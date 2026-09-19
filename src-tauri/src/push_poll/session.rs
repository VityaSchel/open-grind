use grindr::{GrindrClient, Method};

use super::{poll, Poll};
use crate::state;
use crate::storage::{AuthStorage, DeviceStorage};

const INBOX: &str = "/v4/inbox?page=1";
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

pub async fn collect(client: &GrindrClient, since: i64) -> Poll {
	let me = client
		.session_receiver()
		.borrow()
		.as_ref()
		.and_then(|session| session.credentials.profile_id.clone());
	let inbox = fetch(client, Method::POST, INBOX).await;
	let taps = fetch(client, Method::GET, TAPS).await;
	let mut collected = poll(
		inbox.as_ref().unwrap_or(&serde_json::Value::Null),
		taps.as_ref().unwrap_or(&serde_json::Value::Null),
		since,
		me.as_deref(),
	);
	if inbox.is_none() || taps.is_none() {
		collected.watermark = since;
	}
	collected
}

async fn fetch(
	client: &GrindrClient,
	method: Method,
	path: &str,
) -> Option<serde_json::Value> {
	match client.request(method, path).send().await {
		Ok(response) => {
			Some(serde_json::from_slice(&response.body).unwrap_or_default())
		}
		Err(e) => {
			tracing::warn!("[poll] {path} failed: {e}");
			None
		}
	}
}
