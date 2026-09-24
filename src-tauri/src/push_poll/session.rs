use grindr::{GrindrClient, Method};
use serde_json::Value;

use super::{poll, Inbox, Poll, Push, ShownConversation, Watermarks};
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

pub async fn collect(
	client: &GrindrClient,
	since: Watermarks,
	shown: &[ShownConversation],
) -> Poll {
	let me = client
		.session_receiver()
		.borrow()
		.as_ref()
		.and_then(|session| session.credentials.profile_id.clone());
	let inbox = inbox(client, since.inbox).await;
	let taps = fetch(client, Method::GET, TAPS).await;
	let mut polled = poll(inbox.as_ref(), taps.as_ref(), since, me.as_deref());
	for conversation in shown {
		polled
			.pushes
			.extend(withdrawals(client, conversation).await);
	}
	polled
}

async fn withdrawals(
	client: &GrindrClient,
	conversation: &ShownConversation,
) -> Vec<Push> {
	let check = conversation.check();
	let method = if check.body.is_some() {
		Method::POST
	} else {
		Method::GET
	};
	let Some((status, answer)) =
		respond(client, method, &check.path, check.body.as_ref()).await
	else {
		return Vec::new();
	};
	let withdrawn = conversation.withdrawals(status, &answer);
	let understood = (200..300).contains(&status) && !answer.is_null()
		|| !withdrawn.is_empty();
	if !understood {
		tracing::warn!("[poll] {} answered {status}", check.path);
	}
	withdrawn
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
	let (status, json) = respond(client, method, path, None).await?;
	let json = (200..300)
		.contains(&status)
		.then_some(json)
		.filter(|json| !json.is_null());
	if json.is_none() {
		tracing::warn!("[poll] {path} answered {status}");
	}
	json
}

async fn respond(
	client: &GrindrClient,
	method: Method,
	path: &str,
	body: Option<&Value>,
) -> Option<(u16, Value)> {
	let mut request = client.request(method, path);
	if let Some(body) = body {
		request = request.json(body);
	}
	let response = request
		.send()
		.await
		.inspect_err(|e| tracing::warn!("[poll] {path} failed: {e}"))
		.ok()?;
	let json = serde_json::from_slice(&response.body).unwrap_or(Value::Null);
	Some((response.status, json))
}
