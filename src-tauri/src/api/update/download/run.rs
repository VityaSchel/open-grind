use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Runtime};
use tokio::sync::watch;
use wreq::Client;

use super::super::error::UpdateError;
use super::super::release::{self, Candidate};
use super::super::storage::{self, Staged};
use super::super::verify;
use super::stage::accept;
use super::transfer;
use super::transfer::fetch_signature;
use super::{emit, retained, Phase, Progress};

const MAX_STALLED_ATTEMPTS: u32 = 6;
const MAX_ATTEMPTS: u32 = 60;

struct ProcessHold<'a, R: Runtime>(&'a AppHandle<R>);

impl<'a, R: Runtime> ProcessHold<'a, R> {
	fn new(app: &'a AppHandle<R>) -> Self {
		super::super::install::hold_process(app, true);
		Self(app)
	}
}

impl<R: Runtime> Drop for ProcessHold<'_, R> {
	fn drop(&mut self) {
		super::super::install::hold_process(self.0, false);
	}
}

pub(super) async fn run<R: Runtime>(
	app: &AppHandle<R>,
	root: &Path,
	client: &Client,
	candidate: &Candidate,
	cancel: &Arc<AtomicBool>,
	progress: &watch::Sender<Progress>,
	retained: &retained::Retained,
) -> Result<u64, UpdateError> {
	let stage = storage::stage(root, &candidate.tag)?;
	stage.create()?;
	stage.sweep_strays()?;

	let mut staged = match stage.load() {
		Some(staged) if staged.describes(candidate) => staged,
		_ => {
			let _ = fs::remove_file(stage.part());
			let _ = fs::remove_file(stage.payload());
			Staged::new(candidate)
		}
	};

	if staged.verified && staged.payload_on_disk(&stage) {
		retained.forget();
		return Ok(staged.payload_size);
	}
	staged.verified = false;

	let mut digest = verify::Prehash::default();
	retained.restore(&stage, candidate, &mut staged, &mut digest)?;

	let _hold = ProcessHold::new(app);
	let signature_abort = Arc::new(AtomicBool::new(false));
	let signature = {
		let client = client.clone();
		let url = staged.signature_url.clone();
		let stop = signature_abort.clone();
		tauri::async_runtime::spawn(async move {
			let fetched = fetch_signature(&client, &url).await;
			if fetched.is_err() {
				stop.store(true, Ordering::SeqCst);
			}
			fetched
		})
	};

	let halt = transfer::Halt {
		user: cancel.as_ref(),
		abort: signature_abort.as_ref(),
	};
	let mut attempts = 0;
	let mut stalled = 0;
	let downloaded = loop {
		attempts += 1;
		let carried = staged.downloaded;
		let outcome = transfer::transfer(
			app,
			client,
			transfer::Target {
				stage: &stage,
				staged: &mut staged,
				digest: &mut digest,
			},
			candidate,
			&halt,
			progress,
		)
		.await;

		let Err(error) = outcome else { break Ok(()) };
		stalled = if staged.downloaded > carried {
			0
		} else {
			stalled + 1
		};
		if !is_transient(&error)
			|| stalled >= MAX_STALLED_ATTEMPTS
			|| attempts >= MAX_ATTEMPTS
		{
			break Err(error);
		}
		if stalled > 0 {
			let backoff = Duration::from_secs(2u64.pow(stalled.min(4)));
			tokio::time::sleep(backoff).await;
		}
		if halt.requested() {
			break Err(UpdateError::Canceled);
		}
	};

	let settled = async {
		let fetched = signature
			.await
			.map_err(|e| UpdateError::Signature(e.to_string()))?;
		if cancel.load(Ordering::SeqCst) {
			return Err(UpdateError::Canceled);
		}
		let signature = fetched?;
		downloaded?;

		emit(
			app,
			progress,
			Progress::new(candidate, staged.downloaded, Phase::Verifying),
		);

		let suffix = super::super::install::release_asset_suffix()
			.ok_or(UpdateError::NoArtifact)?;
		let expected = release::payload_name(&candidate.tag, &suffix);
		let verified =
			verify::verify_digest(&signature, &digest.finish(), &expected);
		accept(&stage, &mut staged, verified, cancel.load(Ordering::SeqCst))?;
		Ok(staged.payload_size)
	}
	.await;

	if matches!(settled, Err(UpdateError::Canceled)) {
		if let Err(error) = retained.keep(&stage, &staged, digest) {
			tracing::warn!("[update] keeping the cancelled download: {error}");
		}
	}
	settled
}

pub(super) fn is_transient(error: &UpdateError) -> bool {
	match error {
		UpdateError::Network(_) => true,
		UpdateError::Server { status } => {
			*status == 429 || (500..600).contains(status)
		}
		_ => false,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn only_network_and_retryable_statuses_are_retried() {
		assert!(is_transient(&UpdateError::Network("reset".into())));
		assert!(is_transient(&UpdateError::Server { status: 503 }));
		assert!(is_transient(&UpdateError::Server { status: 429 }));
		assert!(!is_transient(&UpdateError::Server { status: 404 }));
		assert!(!is_transient(&UpdateError::Signature("bad".into())));
		assert!(!is_transient(&UpdateError::Oversize));
		assert!(!is_transient(&UpdateError::Canceled));
	}
}
