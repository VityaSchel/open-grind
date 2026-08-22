use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::watch;
use wreq::Client;

use super::super::error::UpdateError;
use super::super::release::Candidate;
use super::retained::Retained;
use super::run::run;
use super::{Phase, Progress, PROGRESS_EVENT};

struct Active {
	tag: String,
	uuid: String,
	cancel: Arc<AtomicBool>,
	progress: watch::Receiver<Progress>,
	task: tauri::async_runtime::JoinHandle<()>,
}

#[derive(Default)]
struct Slots {
	active: Mutex<Option<Active>>,
	last: Mutex<Option<Progress>>,
	retained: Retained,
}

#[derive(Default)]
pub struct Downloads {
	starting: tokio::sync::Mutex<()>,
	slots: Arc<Slots>,
}

fn joins_existing(active: &Active, finished: bool, wanted: &Candidate) -> bool {
	active.tag == wanted.tag
		&& active.uuid == wanted.payload.uuid
		&& !finished
		&& !active.cancel.load(Ordering::SeqCst)
}

impl Downloads {
	pub fn snapshot(&self) -> Option<Progress> {
		if let Some(active) = self.slots.active.lock().unwrap().as_ref() {
			if !active.task.inner().is_finished() {
				return Some(active.progress.borrow().clone());
			}
		}
		self.slots.last.lock().unwrap().clone()
	}

	pub fn forget_retained(&self) {
		self.slots.retained.forget();
	}

	pub fn retain_only(&self, candidate: Option<&Candidate>) {
		self.slots.retained.retain_only(candidate);
	}

	pub fn retained_candidate(&self) -> Option<Candidate> {
		self.slots.retained.candidate()
	}

	pub async fn cancel(&self) {
		let _serialized = self.starting.lock().await;
		if let Some(active) = self.slots.active.lock().unwrap().as_ref() {
			active.cancel.store(true, Ordering::SeqCst);
		}
	}

	pub async fn cancel_and_join(&self) {
		let _serialized = self.starting.lock().await;
		let running = self.slots.active.lock().unwrap().take();
		if let Some(previous) = running {
			previous.cancel.store(true, Ordering::SeqCst);
			let _ = previous.task.await;
		}
	}

	pub async fn cancel_others_and_join(&self, candidate: &Candidate) {
		let _serialized = self.starting.lock().await;
		let running = {
			let mut slot = self.slots.active.lock().unwrap();
			match slot.as_ref() {
				Some(active)
					if active.tag != candidate.tag
						|| active.uuid != candidate.payload.uuid =>
				{
					slot.take()
				}
				_ => None,
			}
		};
		if let Some(previous) = running {
			previous.cancel.store(true, Ordering::SeqCst);
			let _ = previous.task.await;
		}
	}

	pub async fn start<R: Runtime>(
		&self,
		app: &AppHandle<R>,
		root: PathBuf,
		client: Client,
		candidate: Candidate,
	) -> Progress {
		let _serialized = self.starting.lock().await;
		let running = {
			let mut slot = self.slots.active.lock().unwrap();
			match slot.as_ref() {
				Some(active)
					if joins_existing(
						active,
						active.task.inner().is_finished(),
						&candidate,
					) =>
				{
					return active.progress.borrow().clone();
				}
				Some(_) => slot.take(),
				None => None,
			}
		};
		if let Some(previous) = running {
			previous.cancel.store(true, Ordering::SeqCst);
			let _ = previous.task.await;
		}

		let cancel = Arc::new(AtomicBool::new(false));
		let initial = Progress::new(&candidate, 0, Phase::Downloading);
		let (sender, receiver) = watch::channel(initial.clone());

		let task = {
			let app = app.clone();
			let cancel = cancel.clone();
			let candidate = candidate.clone();
			let slots = self.slots.clone();
			tauri::async_runtime::spawn(async move {
				let outcome = run(
					&app,
					&root,
					&client,
					&candidate,
					&cancel,
					&sender,
					&slots.retained,
				)
				.await;
				let final_progress = match outcome {
					Ok(received) => {
						Progress::new(&candidate, received, Phase::Ready)
					}
					Err(UpdateError::Canceled) => Progress::new(
						&candidate,
						sender.borrow().received,
						Phase::Canceled,
					),
					Err(error) => Progress::new(
						&candidate,
						sender.borrow().received,
						Phase::Failed(error),
					),
				};
				let _ = sender.send(final_progress.clone());
				let _ = app.emit(PROGRESS_EVENT, &final_progress);
				*slots.last.lock().unwrap() = Some(final_progress);
				*slots.active.lock().unwrap() = None;
			})
		};

		*self.slots.active.lock().unwrap() = Some(Active {
			tag: candidate.tag.clone(),
			uuid: candidate.payload.uuid.clone(),
			cancel,
			progress: receiver,
			task,
		});
		initial
	}
}

#[cfg(test)]
mod tests {
	use std::time::Duration;

	use super::*;

	fn progress() -> Progress {
		Progress {
			tag: "v1".into(),
			version: "0.2.0".into(),
			phase: Phase::Downloading,
			received: 0,
			total: 10,
		}
	}

	fn active_that_stops_when_cancelled(
		stopped: Arc<AtomicBool>,
	) -> (Active, Arc<AtomicBool>) {
		let cancel = Arc::new(AtomicBool::new(false));
		let (sender, receiver) = watch::channel(progress());
		let task = {
			let cancel = cancel.clone();
			tauri::async_runtime::spawn(async move {
				while !cancel.load(Ordering::SeqCst) {
					tokio::task::yield_now().await;
				}
				tokio::time::sleep(Duration::from_millis(50)).await;
				stopped.store(true, Ordering::SeqCst);
				drop(sender);
			})
		};
		(
			Active {
				tag: "v1".into(),
				uuid: "uuid".into(),
				cancel: cancel.clone(),
				progress: receiver,
				task,
			},
			cancel,
		)
	}

	fn offered(tag: &str, uuid: &str) -> Candidate {
		use crate::api::update::release::Artifact;

		Candidate {
			tag: tag.into(),
			version: "0.2.0".into(),
			notes: None,
			published_at: None,
			payload: Artifact {
				name: "a.apk".into(),
				url: "https://git.opengrind.org/a.apk".into(),
				uuid: uuid.into(),
				size: 10,
			},
			signature: Artifact {
				name: "a.apk.minisig".into(),
				url: "https://git.opengrind.org/a.apk.minisig".into(),
				uuid: "sig".into(),
				size: 228,
			},
		}
	}

	#[tokio::test]
	async fn a_re_uploaded_asset_never_joins_the_transfer_it_replaced() {
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, _) = active_that_stops_when_cancelled(stopped);

		assert!(
			joins_existing(&active, false, &offered("v1", "uuid")),
			"the same asset must join the transfer already running"
		);
		assert!(
			!joins_existing(&active, false, &offered("v1", "replaced")),
			"a re-uploaded asset shares the tag but is different bytes"
		);
		assert!(!joins_existing(&active, true, &offered("v1", "uuid")));
		active.cancel.store(true, Ordering::SeqCst);
	}

	#[tokio::test]
	async fn cancelling_others_leaves_the_transfer_for_the_same_asset_running()
	{
		let downloads = Downloads::default();
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, cancel) =
			active_that_stops_when_cancelled(stopped.clone());
		*downloads.slots.active.lock().unwrap() = Some(active);

		downloads
			.cancel_others_and_join(&offered("v1", "uuid"))
			.await;

		assert!(!cancel.load(Ordering::SeqCst));
		assert!(downloads.slots.active.lock().unwrap().is_some());
		cancel.store(true, Ordering::SeqCst);
	}

	#[tokio::test]
	async fn cancelling_others_stops_a_transfer_for_a_different_asset() {
		let downloads = Downloads::default();
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, cancel) =
			active_that_stops_when_cancelled(stopped.clone());
		*downloads.slots.active.lock().unwrap() = Some(active);

		downloads
			.cancel_others_and_join(&offered("v2", "other"))
			.await;

		assert!(cancel.load(Ordering::SeqCst));
		assert!(
			stopped.load(Ordering::SeqCst),
			"purging the stage before the old transfer stopped is what broke the handover"
		);
		assert!(downloads.slots.active.lock().unwrap().is_none());
	}

	#[tokio::test]
	async fn cancel_and_join_returns_only_after_the_transfer_has_stopped() {
		let downloads = Downloads::default();
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, cancel) =
			active_that_stops_when_cancelled(stopped.clone());
		*downloads.slots.active.lock().unwrap() = Some(active);

		downloads.cancel_and_join().await;

		assert!(
			cancel.load(Ordering::SeqCst),
			"the transfer was never asked to stop"
		);
		assert!(
			stopped.load(Ordering::SeqCst),
			"discard would delete the stage while the transfer is still writing to it"
		);
		assert!(downloads.slots.active.lock().unwrap().is_none());
	}

	#[tokio::test]
	async fn cancel_and_join_with_nothing_running_is_a_no_op() {
		Downloads::default().cancel_and_join().await;
	}
}

#[cfg(test)]
mod end_to_end {
	use std::path::PathBuf;
	use std::time::Duration;

	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

	use super::super::testserver::{self, Plan};
	use super::*;
	use crate::api::update::release::Artifact;

	struct Root(PathBuf);

	impl Drop for Root {
		fn drop(&mut self) {
			let _ = std::fs::remove_dir_all(&self.0);
		}
	}

	fn root(name: &str) -> Root {
		let path = std::env::temp_dir()
			.join(format!("og-discard-{}-{name}", std::process::id()));
		let _ = std::fs::remove_dir_all(&path);
		Root(path)
	}

	fn candidate(url: &str, size: u64) -> Candidate {
		Candidate {
			tag: "v99".into(),
			version: "99.0.0".into(),
			notes: None,
			published_at: None,
			payload: Artifact {
				name: "a.apk".into(),
				url: url.to_owned(),
				uuid: "uuid".into(),
				size,
			},
			signature: Artifact {
				name: "a.apk.minisig".into(),
				url: format!("{url}.minisig"),
				uuid: "sig".into(),
				size: 228,
			},
		}
	}

	fn app() -> tauri::App<MockRuntime> {
		mock_builder()
			.build(mock_context(noop_assets()))
			.expect("mock app")
	}

	#[tokio::test]
	async fn discarding_a_live_download_cancels_it_and_frees_the_stage() {
		let large: Vec<u8> =
			(0..8 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let server = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("live");
		let downloads = Downloads::default();
		let client = Client::builder().build().expect("client");

		downloads
			.start(
				app.handle(),
				root.0.clone(),
				client,
				candidate(&server.url(), large.len() as u64),
			)
			.await;

		let stage = crate::api::update::storage::stage(&root.0, "v99").unwrap();
		for _ in 0..400 {
			if std::fs::metadata(stage.part()).is_ok_and(|m| m.len() > 0) {
				break;
			}
			tokio::time::sleep(Duration::from_millis(5)).await;
		}
		assert!(
			std::fs::metadata(stage.part()).is_ok_and(|m| m.len() > 0),
			"the transfer never started writing"
		);

		downloads.cancel_and_join().await;
		std::fs::remove_dir_all(&root.0)
			.expect("discard must be able to delete the stage");

		let phase = downloads.snapshot().expect("a final progress").phase;
		assert!(
			matches!(phase, Phase::Canceled),
			"a discarded download must report Canceled, got {phase:?}"
		);
	}

	#[tokio::test]
	async fn a_ceiling_stops_a_transfer_that_only_ever_dribbles() {
		let large: Vec<u8> =
			(0..5 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let server = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			stop_body_after: Some(64 * 1024),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("dribble");
		let downloads = Downloads::default();
		let client = Client::builder().build().expect("client");

		downloads
			.start(
				app.handle(),
				root.0.clone(),
				client,
				candidate(&server.url(), large.len() as u64),
			)
			.await;

		let mut settled = None;
		for _ in 0..4000 {
			match downloads.snapshot().map(|progress| progress.phase) {
				Some(Phase::Downloading) | None => {
					tokio::time::sleep(Duration::from_millis(5)).await;
				}
				phase => {
					settled = phase;
					break;
				}
			}
		}
		downloads.cancel_and_join().await;

		assert!(
			matches!(settled, Some(Phase::Failed(_))),
			"progress must not buy unlimited attempts, got {settled:?}"
		);
	}

	#[tokio::test]
	async fn a_transfer_that_keeps_advancing_outlives_the_stall_budget() {
		let large: Vec<u8> =
			(0..12 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let server = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			stop_body_after: Some(1024 * 1024),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("advancing");
		let downloads = Downloads::default();
		let client = Client::builder().build().expect("client");

		downloads
			.start(
				app.handle(),
				root.0.clone(),
				client,
				candidate(&server.url(), large.len() as u64),
			)
			.await;

		let stage = crate::api::update::storage::stage(&root.0, "v99").unwrap();
		for _ in 0..2000 {
			if downloads
				.snapshot()
				.is_some_and(|progress| progress.phase != Phase::Downloading)
			{
				break;
			}
			tokio::time::sleep(Duration::from_millis(5)).await;
		}

		let reached = std::fs::metadata(stage.part())
			.map(|meta| meta.len())
			.unwrap_or(large.len() as u64);
		downloads.cancel_and_join().await;
		assert!(
			reached >= large.len() as u64,
			"a cut every megabyte must not spend a fixed attempt budget: stopped at {reached} of {}",
			large.len()
		);
	}

	#[tokio::test]
	async fn a_cancelled_download_leaves_the_disk_clean_and_resumes_from_memory(
	) {
		let large: Vec<u8> =
			(0..8 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let server = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			pause_every_64k: Some(Duration::from_millis(5)),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("resume-from-memory");
		let downloads = Downloads::default();
		let client = Client::builder().build().expect("client");
		let candidate = candidate(&server.url(), large.len() as u64);

		downloads
			.start(
				app.handle(),
				root.0.clone(),
				client.clone(),
				candidate.clone(),
			)
			.await;

		let stage = crate::api::update::storage::stage(&root.0, "v99").unwrap();
		for _ in 0..400 {
			if std::fs::metadata(stage.part()).is_ok_and(|m| m.len() > 0) {
				break;
			}
			tokio::time::sleep(Duration::from_millis(5)).await;
		}
		downloads.cancel_and_join().await;

		let final_progress = downloads.snapshot().expect("a final progress");
		assert!(
			matches!(final_progress.phase, Phase::Canceled),
			"the transfer outran the cancel: {:?}",
			final_progress.phase
		);
		let kept = final_progress.received;
		assert!(kept > 0, "the test needs bytes to have landed");
		assert!(!stage.part().exists(), "cancelling must clear the disk");
		assert!(
			stage.load().is_none(),
			"cancelling must clear the sidecar too"
		);
		let current = semver::Version::parse("0.1.0").unwrap();
		assert!(
			crate::api::update::storage::resumable(&root.0, &current).is_none(),
			"nothing on disk means nothing to resume from disk"
		);

		downloads
			.start(app.handle(), root.0.clone(), client, candidate)
			.await;
		for _ in 0..400 {
			if server.last_range.lock().unwrap().is_some() {
				break;
			}
			tokio::time::sleep(Duration::from_millis(5)).await;
		}
		let range = server.last_range.lock().unwrap().clone();
		downloads.cancel_and_join().await;

		assert_eq!(
			range,
			Some(format!("bytes={kept}-")),
			"the resumed request must ask only for what was not kept"
		);
	}

	#[tokio::test]
	async fn a_release_whose_signature_cannot_be_fetched_stops_early() {
		let large: Vec<u8> =
			(0..8 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let server = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			signature_status: Some(404),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("nosig");
		let downloads = Downloads::default();
		let client = Client::builder().build().expect("client");

		downloads
			.start(
				app.handle(),
				root.0.clone(),
				client,
				candidate(&server.url(), large.len() as u64),
			)
			.await;

		let mut phase = None;
		for _ in 0..400 {
			match downloads.snapshot().map(|progress| progress.phase) {
				Some(Phase::Downloading) | None => {
					tokio::time::sleep(Duration::from_millis(5)).await;
				}
				settled => {
					phase = settled;
					break;
				}
			}
		}

		assert!(
			matches!(phase, Some(Phase::Failed(UpdateError::Server { .. }))),
			"a missing signature must fail the download, got {phase:?}"
		);
		let stage = crate::api::update::storage::stage(&root.0, "v99").unwrap();
		let written = std::fs::metadata(stage.part())
			.map(|meta| meta.len())
			.unwrap_or(0);
		assert!(
			written < large.len() as u64,
			"the payload must not be pulled in full once the signature is known to be missing"
		);
	}
}
