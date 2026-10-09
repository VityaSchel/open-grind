mod args;
mod guard;
mod messages;
mod store;

use std::process::ExitCode;
use std::time::{Duration, Instant};

use grindr::{GrindrClient, GrindrError, Method, RawResponse};
use serde_json::{json, Value};

use args::{Args, ArgsError};
use guard::{GuardError, LivePair, COUNTERPART_ACCOUNT};
use messages::{find_matching_message, MessageQuery};
use store::StoreError;

const POLL_INTERVAL: Duration = Duration::from_secs(3);
const DEFAULT_WAIT: Duration = Duration::from_secs(60);
const FAILURE_EXIT: u8 = 1;
const USAGE_EXIT: u8 = 2;
const RATE_LIMITED_EXIT: u8 = 3;

enum Failure {
	Args(ArgsError),
	Guard(GuardError),
	Store(StoreError),
	UnknownCommand(String),
	Grindr(GrindrError),
	Status(u16),
	UnreadableResponse,
}

impl Failure {
	fn to_json(&self) -> Value {
		match self {
			Self::Args(error) => failure_json("usage", &error.to_string()),
			Self::Guard(error) => failure_json("guard", &error.to_string()),
			Self::Store(error) => failure_json("store", &error.to_string()),
			Self::UnknownCommand(command) => {
				failure_json("usage", &format!("unknown command {command:?}"))
			}
			Self::Grindr(error) => grindr_failure_json(error),
			Self::Status(status) => {
				json!({ "ok": false, "error": "status", "code": status })
			}
			Self::UnreadableResponse => {
				failure_json("response", "the response was not JSON")
			}
		}
	}

	fn exit_code(&self) -> u8 {
		match self {
			Self::Args(_) | Self::UnknownCommand(_) | Self::Guard(_) => {
				USAGE_EXIT
			}
			Self::Grindr(GrindrError::RateLimited) => RATE_LIMITED_EXIT,
			_ => FAILURE_EXIT,
		}
	}
}

impl From<ArgsError> for Failure {
	fn from(error: ArgsError) -> Self {
		Self::Args(error)
	}
}

impl From<GuardError> for Failure {
	fn from(error: GuardError) -> Self {
		Self::Guard(error)
	}
}

impl From<StoreError> for Failure {
	fn from(error: StoreError) -> Self {
		Self::Store(error)
	}
}

impl From<GrindrError> for Failure {
	fn from(error: GrindrError) -> Self {
		Self::Grindr(error)
	}
}

fn failure_json(error: &str, detail: &str) -> Value {
	json!({ "ok": false, "error": error, "detail": detail })
}

fn grindr_failure_json(error: &GrindrError) -> Value {
	match error {
		GrindrError::RateLimited => {
			json!({ "ok": false, "error": "rate-limited" })
		}
		GrindrError::Api { code, .. } => {
			json!({ "ok": false, "error": "api", "code": code })
		}
		GrindrError::Unauthorized { code, .. } => {
			json!({ "ok": false, "error": "unauthorized", "code": code })
		}
		GrindrError::Banned(_) => json!({ "ok": false, "error": "banned" }),
		GrindrError::Blocked(_) => json!({ "ok": false, "error": "blocked" }),
		GrindrError::Connect(_) | GrindrError::Http(_) => {
			json!({ "ok": false, "error": "network" })
		}
		_ => json!({ "ok": false, "error": "client" }),
	}
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
	let outcome = match Args::parse(std::env::args().skip(1)) {
		Ok(args) => run(&args).await,
		Err(error) => Err(error.into()),
	};
	match outcome {
		Ok(output) => {
			println!("{output}");
			ExitCode::SUCCESS
		}
		Err(failure) => {
			println!("{}", failure.to_json());
			ExitCode::from(failure.exit_code())
		}
	}
}

async fn run(args: &Args) -> Result<Value, Failure> {
	match args.command.as_str() {
		"probe" => probe().await,
		"peer-distance" => peer_distance(args).await,
		"send-text" => send_text(args).await,
		"find-message" => find_message(args).await,
		"delete-conversation" => delete_conversation(args).await,
		"shared-albums" => shared_albums(args).await,
		other => Err(Failure::UnknownCommand(other.to_owned())),
	}
}

fn live_pair(args: &Args) -> Result<LivePair, Failure> {
	Ok(LivePair::new(args.number("as")?, args.number("peer")?)?)
}

async fn signed_in(profile_id: u64) -> Result<GrindrClient, Failure> {
	let client = store::client_for(profile_id)?;
	client.refresh_session().await?;
	Ok(client)
}

fn ensure_success(status: u16) -> Result<(), Failure> {
	match status {
		200..=299 => Ok(()),
		429 => Err(Failure::Grindr(GrindrError::RateLimited)),
		_ => Err(Failure::Status(status)),
	}
}

fn ensure_deleted(status: u16) -> Result<(), Failure> {
	if status == 404 {
		return Ok(());
	}
	ensure_success(status)
}

fn json_body(response: &RawResponse) -> Result<Value, Failure> {
	ensure_success(response.status)?;
	if response.body.is_empty() {
		return Ok(Value::Null);
	}
	serde_json::from_slice(&response.body)
		.map_err(|_| Failure::UnreadableResponse)
}

async fn probe() -> Result<Value, Failure> {
	let client = signed_in(COUNTERPART_ACCOUNT).await?;
	let response = client
		.request(Method::GET, &format!("/v4/profiles/{COUNTERPART_ACCOUNT}"))
		.send()
		.await?;
	let body = json_body(&response)?;
	Ok(json!({
		"ok": true,
		"status": response.status,
		"profileId": body["profiles"][0]["profileId"],
	}))
}

async fn peer_distance(args: &Args) -> Result<Value, Failure> {
	let pair = live_pair(args)?;
	let client = signed_in(pair.actor).await?;
	let response = client
		.request(Method::GET, &format!("/v7/profiles/{}", pair.peer))
		.send()
		.await?;
	let body = json_body(&response)?;
	let profile = &body["profiles"][0];
	Ok(json!({
		"ok": true,
		"status": response.status,
		"profileId": profile["profileId"],
		"distance": profile["distance"],
	}))
}

async fn send_text(args: &Args) -> Result<Value, Failure> {
	let pair = live_pair(args)?;
	let text = args.text("text")?;
	let client = signed_in(pair.actor).await?;
	let response = client
		.request(Method::POST, "/v4/chat/message/send")
		.json(&json!({
			"type": "Text",
			"target": { "type": "Direct", "targetId": pair.peer },
			"body": { "text": text },
		}))
		.send()
		.await?;
	let body = json_body(&response)?;
	Ok(json!({
		"ok": true,
		"status": response.status,
		"messageId": body["messageId"],
		"conversationId": body["conversationId"],
	}))
}

async fn find_message(args: &Args) -> Result<Value, Failure> {
	let pair = live_pair(args)?;
	let query = MessageQuery {
		sender: pair.peer,
		text: args.optional_text("text"),
		kind: args.optional_text("type"),
		since_ms: args.optional_number("since-ms")?.unwrap_or(0),
	};
	let wait = args
		.optional_number("timeout-ms")?
		.map_or(DEFAULT_WAIT, Duration::from_millis);
	let deadline = Instant::now() + wait;
	let client = signed_in(pair.actor).await?;
	let path = format!(
		"/v5/chat/conversation/{}/message?profile=false",
		pair.conversation_id()
	);
	loop {
		let response = client.request(Method::GET, &path).send().await?;
		let body = json_body(&response)?;
		if let Some(found) = find_matching_message(&body, &query) {
			return Ok(json!({
				"ok": true,
				"found": true,
				"messageId": found["messageId"],
				"type": found["type"],
			}));
		}
		if Instant::now() + POLL_INTERVAL > deadline {
			return Ok(json!({ "ok": true, "found": false }));
		}
		tokio::time::sleep(POLL_INTERVAL).await;
	}
}

async fn delete_conversation(args: &Args) -> Result<Value, Failure> {
	let pair = live_pair(args)?;
	let client = signed_in(pair.actor).await?;
	let response = client
		.request(
			Method::DELETE,
			&format!("/v4/chat/conversation/{}", pair.conversation_id()),
		)
		.send()
		.await?;
	ensure_deleted(response.status)?;
	Ok(json!({ "ok": true, "status": response.status }))
}

fn id_text(id: &Value) -> String {
	match id {
		Value::String(text) => text.clone(),
		other => other.to_string(),
	}
}

async fn shared_album_ids(
	client: &GrindrClient,
	owner: u64,
) -> Result<Vec<String>, Failure> {
	let response = client
		.request(Method::GET, &format!("/v2/albums/shares/{owner}"))
		.send()
		.await?;
	let body = json_body(&response)?;
	Ok(body["albums"]
		.as_array()
		.map(|albums| {
			albums
				.iter()
				.map(|album| id_text(&album["albumId"]))
				.collect()
		})
		.unwrap_or_default())
}

async fn shared_albums(args: &Args) -> Result<Value, Failure> {
	let pair = live_pair(args)?;
	let awaited = args.optional_number("album-id")?.map(|id| id.to_string());
	let want_shared = match args.optional_text("expect") {
		None | Some("shared") => true,
		Some("unshared") => false,
		Some(other) => {
			return Err(Failure::Args(ArgsError::UnexpectedValue(
				other.to_owned(),
			)))
		}
	};
	let wait = args
		.optional_number("timeout-ms")?
		.map_or(DEFAULT_WAIT, Duration::from_millis);
	let deadline = Instant::now() + wait;
	let client = signed_in(pair.actor).await?;
	loop {
		let album_ids = shared_album_ids(&client, pair.peer).await?;
		let settled = awaited
			.as_ref()
			.is_none_or(|id| album_ids.contains(id) == want_shared);
		if settled || Instant::now() + POLL_INTERVAL > deadline {
			return Ok(json!({
				"ok": true,
				"settled": settled,
				"albumIds": album_ids,
			}));
		}
		tokio::time::sleep(POLL_INTERVAL).await;
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_rate_limited_response_exits_as_rate_limited() {
		let failure = ensure_success(429).unwrap_err();
		assert_eq!(failure.exit_code(), RATE_LIMITED_EXIT);
		assert_eq!(failure.to_json()["error"], "rate-limited");
	}

	#[test]
	fn a_failed_response_is_a_failure_that_names_its_status() {
		let failure = ensure_success(403).unwrap_err();
		assert_eq!(failure.exit_code(), FAILURE_EXIT);
		assert_eq!(failure.to_json()["code"], 403);
	}

	#[test]
	fn an_error_body_is_never_read_as_data() {
		let response = RawResponse {
			status: 500,
			body: br#"{"messages":[]}"#.to_vec(),
		};
		assert!(json_body(&response).is_err());
	}

	#[test]
	fn a_successful_response_passes() {
		assert!(ensure_success(204).is_ok());
	}

	#[test]
	fn a_conversation_already_gone_counts_as_deleted() {
		assert!(ensure_deleted(404).is_ok());
		assert!(ensure_deleted(403).is_err());
	}
}
