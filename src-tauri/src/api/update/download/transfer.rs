use std::fs::OpenOptions;
use std::io::{BufWriter, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Runtime};
use tokio::sync::watch;
use wreq::Client;

use super::super::client;
use super::super::error::UpdateError;
use super::super::release::Candidate;
use super::super::storage::{Stage, Staged};
use super::super::verify;
use super::resume;
use super::stage::flush;
use super::{emit, Phase, Progress};

const SIGNATURE_MAX_BYTES: usize = 64 * 1024;
const CHECKPOINT_BYTES: u64 = 4 * 1024 * 1024;
const CHECKPOINT_INTERVAL: Duration = Duration::from_secs(5);
const EMIT_INTERVAL: Duration = Duration::from_millis(500);
const EMIT_BYTES: u64 = 1024 * 1024;

pub(super) struct Target<'a> {
	pub stage: &'a Stage,
	pub staged: &'a mut Staged,
	pub digest: &'a mut verify::Prehash,
}

pub(super) struct Halt<'a> {
	pub user: &'a AtomicBool,
	pub abort: &'a AtomicBool,
}

impl Halt<'_> {
	pub(super) fn requested(&self) -> bool {
		self.user.load(Ordering::SeqCst) || self.abort.load(Ordering::SeqCst)
	}
}

pub(super) async fn transfer<R: Runtime>(
	app: &AppHandle<R>,
	client: &Client,
	target: Target<'_>,
	candidate: &Candidate,
	halt: &Halt<'_>,
	progress: &watch::Sender<Progress>,
) -> Result<(), UpdateError> {
	let Target {
		stage,
		staged,
		digest,
	} = target;
	let (mut response, written) = match resume::open(client, stage, staged)
		.await?
	{
		resume::Opening::Complete => {
			rehash(app, progress, candidate, digest, stage, staged.downloaded)?;
			return Ok(());
		}
		resume::Opening::Body(response, written) => (response, written),
	};
	let mut written = written;
	stage.save(staged)?;
	rehash(app, progress, candidate, digest, stage, written)?;

	let file = OpenOptions::new()
		.create(true)
		.append(true)
		.open(stage.part())?;
	let mut sink = BufWriter::with_capacity(1024 * 1024, file);

	let mut checkpoint_at = written;
	let mut checkpoint_time = Instant::now();
	let mut emitted_at = written;
	let mut emitted_time = Instant::now();

	loop {
		if halt.requested() {
			flush(&mut sink, stage, staged, written)?;
			emit(
				app,
				progress,
				Progress::new(candidate, written, Phase::Downloading),
			);
			return Err(UpdateError::Canceled);
		}
		let chunk = match response.chunk().await {
			Ok(chunk) => chunk,
			Err(e) => {
				flush(&mut sink, stage, staged, written)?;
				return Err(UpdateError::Network(e.to_string()));
			}
		};
		let Some(chunk) = chunk else { break };

		if written + chunk.len() as u64 > staged.payload_size {
			let _ = stage.discard();
			return Err(UpdateError::Oversize);
		}
		sink.write_all(&chunk)?;
		digest.update(&chunk);
		written += chunk.len() as u64;

		if written - checkpoint_at >= CHECKPOINT_BYTES
			|| checkpoint_time.elapsed() >= CHECKPOINT_INTERVAL
		{
			flush(&mut sink, stage, staged, written)?;
			checkpoint_at = written;
			checkpoint_time = Instant::now();
		}
		if written - emitted_at >= EMIT_BYTES
			|| emitted_time.elapsed() >= EMIT_INTERVAL
		{
			emit(
				app,
				progress,
				Progress::new(candidate, written, Phase::Downloading),
			);
			emitted_at = written;
			emitted_time = Instant::now();
		}
	}

	flush(&mut sink, stage, staged, written)?;
	if written != staged.payload_size {
		return Err(UpdateError::Network(format!(
			"transfer stopped at {written} of {} bytes",
			staged.payload_size
		)));
	}
	Ok(())
}

fn rehash<R: Runtime>(
	app: &AppHandle<R>,
	progress: &watch::Sender<Progress>,
	candidate: &Candidate,
	digest: &mut verify::Prehash,
	stage: &Stage,
	upto: u64,
) -> Result<(), UpdateError> {
	if upto > 0 && digest.hashed() != upto {
		emit(
			app,
			progress,
			Progress::new(candidate, upto, Phase::Verifying),
		);
	}
	digest.sync(&stage.part(), upto)
}

pub(super) async fn fetch_signature(
	client: &Client,
	url: &str,
) -> Result<String, UpdateError> {
	let response = client::get(client, url)
		.send()
		.await
		.map_err(|e| UpdateError::Network(e.to_string()))?;
	if !response.status().is_success() {
		return Err(UpdateError::Server {
			status: response.status().as_u16(),
		});
	}
	client::text_within(response, SIGNATURE_MAX_BYTES, UpdateError::Signature)
		.await
}

#[cfg(test)]
mod tests {
	use std::fs;

	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

	use crate::api::update::storage;

	use super::super::run::is_transient;
	use super::super::testserver::{self, Plan};
	use super::*;

	const BODY: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

	struct Fixture {
		root: std::path::PathBuf,
		stage: Stage,
		staged: Staged,
		candidate: Candidate,
	}

	impl Drop for Fixture {
		fn drop(&mut self) {
			let _ = fs::remove_dir_all(&self.root);
		}
	}

	fn fixture(name: &str, url: &str, size: u64) -> Fixture {
		let root = std::env::temp_dir()
			.join(format!("og-transfer-{}-{name}", std::process::id()));
		let _ = fs::remove_dir_all(&root);
		let stage = storage::stage(&root, "v1").unwrap();
		stage.create().unwrap();

		let candidate = Candidate {
			tag: "v1".into(),
			version: "0.2.0".into(),
			notes: None,
			published_at: None,
			payload: crate::api::update::release::Artifact {
				name: "a.apk".into(),
				url: url.to_owned(),
				uuid: "uuid".into(),
				size,
			},
			signature: crate::api::update::release::Artifact {
				name: "a.apk.minisig".into(),
				url: format!("{url}.minisig"),
				uuid: "sig".into(),
				size: 228,
			},
		};
		let staged = Staged::new(&candidate);
		Fixture {
			root,
			stage,
			staged,
			candidate,
		}
	}

	fn app() -> tauri::App<MockRuntime> {
		mock_builder()
			.build(mock_context(noop_assets()))
			.expect("mock app")
	}

	fn plain_client() -> Client {
		Client::builder().build().expect("client")
	}

	async fn run_transfer(
		app: &tauri::App<MockRuntime>,
		fixture: &mut Fixture,
	) -> Result<(), UpdateError> {
		let cancel = AtomicBool::new(false);
		let mut digest = verify::Prehash::default();
		run_transfer_with(app, fixture, &cancel, &mut digest).await
	}

	async fn run_transfer_with(
		app: &tauri::App<MockRuntime>,
		fixture: &mut Fixture,
		cancel: &AtomicBool,
		digest: &mut verify::Prehash,
	) -> Result<(), UpdateError> {
		let (sender, _receiver) = watch::channel(Progress::new(
			&fixture.candidate,
			0,
			Phase::Downloading,
		));
		let abort = AtomicBool::new(false);
		transfer(
			app.handle(),
			&plain_client(),
			Target {
				stage: &fixture.stage,
				staged: &mut fixture.staged,
				digest,
			},
			&fixture.candidate,
			&Halt {
				user: cancel,
				abort: &abort,
			},
			&sender,
		)
		.await
	}

	#[tokio::test]
	async fn a_fresh_transfer_writes_the_whole_body_and_records_the_validator()
	{
		let server = testserver::spawn(Plan {
			body: BODY.to_vec(),
			etag: Some("\"uuid\"".into()),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture = fixture("fresh", &server.url(), BODY.len() as u64);

		run_transfer(&app, &mut fixture).await.unwrap();

		assert_eq!(fs::read(fixture.stage.part()).unwrap(), BODY);
		assert_eq!(fixture.staged.downloaded, BODY.len() as u64);
		assert_eq!(fixture.staged.validator.as_deref(), Some("\"uuid\""));
		assert!(server.last_range.lock().unwrap().is_none());
	}

	#[tokio::test]
	async fn a_resumed_transfer_asks_for_the_rest_and_appends_it() {
		let server = testserver::spawn(Plan {
			body: BODY.to_vec(),
			etag: Some("\"uuid\"".into()),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture = fixture("resume", &server.url(), BODY.len() as u64);
		fs::write(fixture.stage.part(), &BODY[..10]).unwrap();
		fixture.staged.downloaded = 10;
		fixture.staged.validator = Some("\"uuid\"".into());

		run_transfer(&app, &mut fixture).await.unwrap();

		assert_eq!(fs::read(fixture.stage.part()).unwrap(), BODY);
		assert_eq!(
			server.last_range.lock().unwrap().as_deref(),
			Some("bytes=10-")
		);
		assert_eq!(
			server.last_if_range.lock().unwrap().as_deref(),
			Some("\"uuid\"")
		);
	}

	#[tokio::test]
	async fn a_replaced_asset_answers_200_and_the_partial_file_is_discarded() {
		let server = testserver::spawn(Plan {
			body: BODY.to_vec(),
			etag: Some("\"new\"".into()),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture = fixture("stale", &server.url(), BODY.len() as u64);
		fs::write(fixture.stage.part(), b"stale bytes").unwrap();
		fixture.staged.downloaded = 11;
		fixture.staged.validator = Some("\"old\"".into());

		run_transfer(&app, &mut fixture).await.unwrap();

		assert_eq!(
			fs::read(fixture.stage.part()).unwrap(),
			BODY,
			"a full-body answer must replace the stale prefix, not append to it"
		);
		assert_eq!(fixture.staged.validator.as_deref(), Some("\"new\""));
	}

	#[tokio::test]
	async fn a_server_resuming_at_the_wrong_offset_restarts_the_transfer() {
		let server = testserver::spawn(Plan {
			body: BODY.to_vec(),
			etag: Some("\"uuid\"".into()),
			resume_at_wrong_offset: Some(4),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture = fixture("offset", &server.url(), BODY.len() as u64);
		fs::write(fixture.stage.part(), &BODY[..10]).unwrap();
		fixture.staged.downloaded = 10;
		fixture.staged.validator = Some("\"uuid\"".into());

		let error = run_transfer(&app, &mut fixture).await.unwrap_err();

		assert!(matches!(error, UpdateError::Network(_)), "{error:?}");
		assert_eq!(fixture.staged.downloaded, 0);
		assert_eq!(fs::metadata(fixture.stage.part()).unwrap().len(), 0);
	}

	#[tokio::test]
	async fn a_complete_file_the_server_refuses_to_range_is_already_done() {
		let server = testserver::spawn(Plan {
			body: BODY.to_vec(),
			refuse_range_reporting_total: Some(BODY.len() as u64),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture = fixture("complete", &server.url(), BODY.len() as u64);
		fs::write(fixture.stage.part(), BODY).unwrap();
		fixture.staged.downloaded = BODY.len() as u64;

		run_transfer(&app, &mut fixture).await.unwrap();

		assert_eq!(fs::read(fixture.stage.part()).unwrap(), BODY);
	}

	#[tokio::test]
	async fn a_rejected_resume_offset_on_an_incomplete_file_restarts() {
		let server = testserver::spawn(Plan {
			body: BODY.to_vec(),
			refuse_range_reporting_total: Some(BODY.len() as u64),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture = fixture("rejected", &server.url(), BODY.len() as u64);
		fs::write(fixture.stage.part(), &BODY[..10]).unwrap();
		fixture.staged.downloaded = 10;

		let error = run_transfer(&app, &mut fixture).await.unwrap_err();

		assert!(matches!(error, UpdateError::Network(_)), "{error:?}");
		assert_eq!(fixture.staged.downloaded, 0);
	}

	#[tokio::test]
	async fn an_asset_that_no_longer_matches_the_index_is_dropped_not_resumed()
	{
		let server = testserver::spawn(Plan {
			body: BODY.to_vec(),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture =
			fixture("replaced", &server.url(), BODY.len() as u64 - 8);

		let error = run_transfer(&app, &mut fixture).await.unwrap_err();

		assert!(matches!(error, UpdateError::AssetReplaced), "{error:?}");
		assert!(
			!fixture.stage.part().exists() && !fixture.stage.payload().exists(),
			"a stale stage must not survive to be resumed into the same error"
		);
	}

	#[tokio::test]
	async fn a_resumed_asset_whose_total_changed_is_dropped_not_restarted() {
		let server = testserver::spawn(Plan {
			body: BODY.to_vec(),
			etag: Some("\"uuid\"".into()),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture =
			fixture("regrown", &server.url(), BODY.len() as u64 - 8);
		fs::write(fixture.stage.part(), &BODY[..10]).unwrap();
		fixture.staged.downloaded = 10;
		fixture.staged.validator = Some("\"uuid\"".into());

		let error = run_transfer(&app, &mut fixture).await.unwrap_err();

		assert!(matches!(error, UpdateError::AssetReplaced), "{error:?}");
		assert!(!fixture.stage.part().exists());
	}

	#[tokio::test]
	async fn a_chunked_body_longer_than_declared_is_refused_mid_stream() {
		let server = testserver::spawn(Plan {
			body: BODY.to_vec(),
			omit_length: true,
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture =
			fixture("oversize", &server.url(), BODY.len() as u64 - 8);

		let error = run_transfer(&app, &mut fixture).await.unwrap_err();

		assert!(matches!(error, UpdateError::Oversize), "{error:?}");
		assert!(
			!fixture.stage.payload().exists(),
			"an oversized body must never reach the install path"
		);
	}

	#[tokio::test]
	async fn a_short_body_is_retryable_and_never_overclaims_what_is_on_disk() {
		let server = testserver::spawn(Plan {
			body: BODY.to_vec(),
			stop_body_after: Some(12),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture = fixture("short", &server.url(), BODY.len() as u64);

		let error = run_transfer(&app, &mut fixture).await.unwrap_err();

		assert!(matches!(error, UpdateError::Network(_)), "{error:?}");
		assert!(is_transient(&error), "a cut body must be retried");
		let on_disk = fs::metadata(fixture.stage.part())
			.map(|meta| meta.len())
			.unwrap_or(0);
		assert!(
			fixture.staged.downloaded <= on_disk,
			"the sidecar must never claim more than the file holds: {} > {on_disk}",
			fixture.staged.downloaded
		);
	}

	#[tokio::test]
	async fn a_server_error_status_is_reported_with_its_code() {
		let server = testserver::spawn(Plan {
			always_status: Some(500),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture = fixture("status", &server.url(), 36);

		let error = run_transfer(&app, &mut fixture).await.unwrap_err();

		assert!(
			matches!(error, UpdateError::Server { status: 500 }),
			"{error:?}"
		);
		assert!(is_transient(&error), "a 500 must be retried");
	}

	#[tokio::test]
	async fn a_cancel_before_the_first_chunk_leaves_a_resumable_part() {
		let server = testserver::spawn(Plan {
			body: BODY.to_vec(),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture = fixture("cancel", &server.url(), BODY.len() as u64);
		let cancel = AtomicBool::new(true);

		let error = run_transfer_with(
			&app,
			&mut fixture,
			&cancel,
			&mut verify::Prehash::default(),
		)
		.await
		.unwrap_err();

		assert!(matches!(error, UpdateError::Canceled), "{error:?}");
		assert!(!fixture.stage.payload().exists());
	}

	#[tokio::test]
	async fn a_checkpoint_survives_a_cut_body_and_the_retry_resumes_from_it() {
		let large: Vec<u8> =
			(0..5 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let cut = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			stop_body_after: Some(4_700_000),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture = fixture("checkpoint", &cut.url(), large.len() as u64);

		run_transfer(&app, &mut fixture).await.unwrap_err();

		let checkpointed = fixture.staged.downloaded;
		assert!(
			checkpointed >= CHECKPOINT_BYTES,
			"a cut body must leave the last checkpoint behind, got {checkpointed}"
		);

		let whole = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			..Plan::default()
		})
		.await;
		fixture.staged.payload_url = whole.url();

		run_transfer(&app, &mut fixture).await.unwrap();

		assert_eq!(fs::read(fixture.stage.part()).unwrap(), large);
		assert_eq!(
			whole.last_range.lock().unwrap().as_deref(),
			Some(format!("bytes={checkpointed}-").as_str()),
			"the retry must ask only for the bytes after the checkpoint"
		);
	}

	fn hex(bytes: &[u8]) -> String {
		bytes.iter().map(|byte| format!("{byte:02x}")).collect()
	}

	async fn cut_then_whole(
		name: &str,
		body: &[u8],
		cut_at: usize,
	) -> (tauri::App<MockRuntime>, Fixture, testserver::Server) {
		let cut = testserver::spawn(Plan {
			body: body.to_vec(),
			etag: Some("\"uuid\"".into()),
			stop_body_after: Some(cut_at),
			..Plan::default()
		})
		.await;
		let app = app();
		let fixture = fixture(name, &cut.url(), body.len() as u64);
		let whole = testserver::spawn(Plan {
			body: body.to_vec(),
			etag: Some("\"uuid\"".into()),
			..Plan::default()
		})
		.await;
		(app, fixture, whole)
	}

	#[tokio::test]
	async fn a_dropped_connection_leaves_the_digest_in_step_with_the_disk() {
		let large: Vec<u8> =
			(0..5 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let (app, mut fixture, whole) =
			cut_then_whole("in-step", &large, 4_700_000).await;
		let cancel = AtomicBool::new(false);
		let mut digest = verify::Prehash::default();

		run_transfer_with(&app, &mut fixture, &cancel, &mut digest)
			.await
			.unwrap_err();

		let kept = fixture.staged.downloaded;
		assert!(kept > CHECKPOINT_BYTES, "the test needs a cut mid-stream");
		assert_eq!(
			digest.hashed(),
			kept,
			"a retry re-hashes the whole prefix unless the sidecar keeps up"
		);
		assert_eq!(fs::metadata(fixture.stage.part()).unwrap().len(), kept);

		fixture.staged.payload_url = whole.url();
		run_transfer_with(&app, &mut fixture, &cancel, &mut digest)
			.await
			.unwrap();

		assert_eq!(
			whole.last_range.lock().unwrap().as_deref(),
			Some(format!("bytes={kept}-").as_str()),
			"the retry must ask for exactly what the drop cost it"
		);
		assert_eq!(
			hex(&digest.finish()),
			verify::payload_digest(&fixture.stage.part()).unwrap()
		);
	}

	#[tokio::test]
	async fn a_streamed_digest_matches_a_full_read_of_the_payload() {
		let server = testserver::spawn(Plan {
			body: BODY.to_vec(),
			..Plan::default()
		})
		.await;
		let app = app();
		let mut fixture = fixture("streamed", &server.url(), BODY.len() as u64);
		let cancel = AtomicBool::new(false);
		let mut digest = verify::Prehash::default();

		run_transfer_with(&app, &mut fixture, &cancel, &mut digest)
			.await
			.unwrap();

		assert_eq!(
			hex(&digest.finish()),
			verify::payload_digest(&fixture.stage.part()).unwrap(),
			"streaming the body must produce the digest a full read would"
		);
	}

	#[tokio::test]
	async fn a_resumed_transfer_keeps_the_digest_covering_the_whole_payload() {
		let large: Vec<u8> =
			(0..5 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let (app, mut fixture, whole) =
			cut_then_whole("resume-digest", &large, 4_700_000).await;
		let cancel = AtomicBool::new(false);
		let mut digest = verify::Prehash::default();

		run_transfer_with(&app, &mut fixture, &cancel, &mut digest)
			.await
			.unwrap_err();
		fixture.staged.payload_url = whole.url();
		run_transfer_with(&app, &mut fixture, &cancel, &mut digest)
			.await
			.unwrap();

		assert_eq!(fs::read(fixture.stage.part()).unwrap(), large);
		assert_eq!(
			hex(&digest.finish()),
			verify::payload_digest(&fixture.stage.part()).unwrap(),
			"a digest carried across a resume must cover every byte once"
		);
	}

	#[tokio::test]
	async fn a_relaunched_resume_rehashes_the_part_it_did_not_download() {
		let large: Vec<u8> =
			(0..5 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let (app, mut fixture, whole) =
			cut_then_whole("relaunch-digest", &large, 4_700_000).await;
		let cancel = AtomicBool::new(false);

		run_transfer_with(
			&app,
			&mut fixture,
			&cancel,
			&mut verify::Prehash::default(),
		)
		.await
		.unwrap_err();
		assert!(fixture.staged.downloaded > 0);

		fixture.staged.payload_url = whole.url();
		let mut restarted = verify::Prehash::default();
		run_transfer_with(&app, &mut fixture, &cancel, &mut restarted)
			.await
			.unwrap();

		assert_eq!(
			hex(&restarted.finish()),
			verify::payload_digest(&fixture.stage.part()).unwrap(),
			"a hasher that starts empty must re-read the bytes already on disk"
		);
	}

	#[tokio::test]
	async fn a_signature_is_fetched_as_text() {
		let server = testserver::spawn(Plan {
			body: b"untrusted comment: x\nRWQsig\n".to_vec(),
			..Plan::default()
		})
		.await;

		let signature = fetch_signature(&plain_client(), &server.url())
			.await
			.unwrap();

		assert!(signature.contains("RWQsig"));
	}

	#[tokio::test]
	async fn an_implausibly_large_signature_is_refused() {
		let server = testserver::spawn(Plan {
			body: vec![b'x'; SIGNATURE_MAX_BYTES + 1],
			..Plan::default()
		})
		.await;

		let error = fetch_signature(&plain_client(), &server.url())
			.await
			.unwrap_err();

		assert!(matches!(error, UpdateError::Signature(_)), "{error:?}");
	}

	#[tokio::test]
	async fn a_signature_the_host_will_not_serve_is_reported_by_status() {
		let server = testserver::spawn(Plan {
			always_status: Some(500),
			..Plan::default()
		})
		.await;

		let error = fetch_signature(&plain_client(), &server.url())
			.await
			.unwrap_err();

		assert!(
			matches!(error, UpdateError::Server { status: 500 }),
			"{error:?}"
		);
	}
}
