use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use grindr::Bytes;

use super::super::stream::{Chunks, Fault};
use super::*;

const CHUNK: usize = 16 * 1024;

fn file(len: usize) -> Arc<Vec<u8>> {
	Arc::new((0..len).map(|i| (i % 251) as u8).collect())
}

struct Stream {
	file: Arc<Vec<u8>>,
	at: usize,
	fail_at: Option<usize>,
	released_on_drop: Option<Arc<AtomicBool>>,
	waits_for_release: Option<Arc<AtomicBool>>,
}

impl Drop for Stream {
	fn drop(&mut self) {
		if let Some(released) = &self.released_on_drop {
			released.store(true, Ordering::SeqCst);
		}
	}
}

impl Chunks for Stream {
	async fn next(&mut self) -> Result<Option<Bytes>, Fault> {
		if let Some(released) = &self.waits_for_release {
			while !released.load(Ordering::SeqCst) {
				tokio::time::sleep(Duration::from_millis(20)).await;
			}
		}
		if self.fail_at.is_some_and(|at| self.at >= at) {
			return Err(Fault::Upstream("reset".to_owned()));
		}
		if self.at >= self.file.len() {
			return Ok(None);
		}
		let end = (self.at + CHUNK).min(self.file.len());
		let bytes = Bytes::copy_from_slice(&self.file[self.at..end]);
		self.at = end;
		Ok(Some(bytes))
	}
}

#[derive(Default)]
struct Log(Mutex<Vec<u64>>);

struct Cdn {
	file: Arc<Vec<u8>>,
	opens: Arc<Log>,
	ignores_ranges: bool,
	fail_at: Option<usize>,
	first_holds_the_connection: Option<Arc<AtomicBool>>,
	unblocks: AtomicUsize,
}

impl Cdn {
	fn of(file: Arc<Vec<u8>>) -> Self {
		Self {
			file,
			opens: Arc::default(),
			ignores_ranges: false,
			fail_at: None,
			first_holds_the_connection: None,
			unblocks: AtomicUsize::new(0),
		}
	}

	fn opens(&self) -> Vec<u64> {
		self.opens.0.lock().unwrap().clone()
	}
}

impl Opener for Cdn {
	type Chunks = Stream;

	async fn open(&self, from: u64) -> Result<Opened<Stream>, Failure> {
		let first = {
			let mut opens = self.opens.0.lock().unwrap();
			opens.push(from);
			opens.len() == 1
		};
		let held = self.first_holds_the_connection.clone();
		let origin = if self.ignores_ranges { 0 } else { from };
		Ok(Opened {
			total: Some(self.file.len() as u64),
			content_type: Some("video/mp4".to_owned()),
			skip: from - origin,
			chunks: Stream {
				file: Arc::clone(&self.file),
				at: origin as usize,
				fail_at: self.fail_at,
				released_on_drop: held.clone().filter(|_| first),
				waits_for_release: held.filter(|_| !first),
			},
			permit: None,
		})
	}

	fn unblock(&self) {
		self.unblocks.fetch_add(1, Ordering::SeqCst);
	}
}

fn expected(file: &[u8], first: u64, length: u64) -> Vec<u8> {
	let end = (first + length).min(file.len() as u64);
	file[first as usize..end as usize].to_vec()
}

#[tokio::test]
async fn sequential_small_reads_share_one_upstream_request() {
	let file = file(3 * 1024 * 1024);
	let cdn = Cdn::of(Arc::clone(&file));
	let mut session = Session::default();

	for read in 0..40u64 {
		let first = read * 64 * 1024;
		let piece = session.read(&cdn, first, 64 * 1024).await.unwrap();
		assert_eq!(piece.bytes, expected(&file, first, 64 * 1024));
	}

	assert_eq!(cdn.opens(), vec![0]);
}

#[tokio::test]
async fn reads_alternating_between_two_regions_keep_two_upstreams() {
	let file = file(8 * 1024 * 1024);
	let cdn = Cdn::of(Arc::clone(&file));
	let mut session = Session::default();
	let audio = 5 * 1024 * 1024;

	for step in 0..20u64 {
		let video = session.read(&cdn, step * 32 * 1024, 32 * 1024).await;
		let sound = session.read(&cdn, audio + step * 400, 400).await;
		assert_eq!(
			video.unwrap().bytes,
			expected(&file, step * 32 * 1024, 32 * 1024)
		);
		assert_eq!(
			sound.unwrap().bytes,
			expected(&file, audio + step * 400, 400)
		);
	}

	assert_eq!(cdn.opens(), vec![0, audio]);
}

#[tokio::test]
async fn a_seek_elsewhere_replaces_the_stalest_upstream() {
	let file = file(20 * 1024 * 1024);
	let cdn = Cdn::of(Arc::clone(&file));
	let mut session = Session::default();

	session.read(&cdn, 0, 1024).await.unwrap();
	session.read(&cdn, 10 * 1024 * 1024, 1024).await.unwrap();
	session.read(&cdn, 1024, 1024).await.unwrap();
	let far = session.read(&cdn, 15 * 1024 * 1024, 1024).await.unwrap();
	session.read(&cdn, 2048, 1024).await.unwrap();

	assert_eq!(far.bytes, expected(&file, 15 * 1024 * 1024, 1024));
	assert_eq!(cdn.opens(), vec![0, 10 * 1024 * 1024, 15 * 1024 * 1024]);
}

#[tokio::test]
async fn a_small_jump_forward_reads_through_instead_of_reopening() {
	let file = file(4 * 1024 * 1024);
	let cdn = Cdn::of(Arc::clone(&file));
	let mut session = Session::default();

	session.read(&cdn, 0, 1024).await.unwrap();
	let ahead = session.read(&cdn, 512 * 1024, 1024).await.unwrap();

	assert_eq!(ahead.bytes, expected(&file, 512 * 1024, 1024));
	assert_eq!(cdn.opens(), vec![0]);
}

#[tokio::test]
async fn a_re_read_of_recent_bytes_is_served_from_what_was_kept() {
	let file = file(4 * 1024 * 1024);
	let cdn = Cdn::of(Arc::clone(&file));
	let mut session = Session::default();

	session.read(&cdn, 0, 1024 * 1024).await.unwrap();
	let again = session.read(&cdn, 100 * 1024, 2048).await.unwrap();

	assert_eq!(again.bytes, expected(&file, 100 * 1024, 2048));
	assert_eq!(cdn.opens(), vec![0]);
}

#[tokio::test]
async fn memory_stays_bounded_while_reading_a_long_file() {
	let file = file(40 * 1024 * 1024);
	let cdn = Cdn::of(Arc::clone(&file));
	let mut session = Session::default();

	for read in 0..(40 * 1024 / 256) {
		session
			.read(&cdn, read * 256 * 1024, 256 * 1024)
			.await
			.unwrap();
		let kept: u64 =
			session.cursors.iter().map(|cursor| cursor.kept_len).sum();
		assert!(
			kept <= KEPT_BEHIND + 256 * 1024 + CHUNK as u64,
			"kept {kept}"
		);
	}
	assert_eq!(cdn.opens(), vec![0]);
}

#[tokio::test]
async fn a_read_running_past_the_end_is_cut_at_the_last_byte() {
	let file = file(100_000);
	let cdn = Cdn::of(Arc::clone(&file));
	let mut session = Session::default();

	let tail = session.read(&cdn, 90_000, 64 * 1024).await.unwrap();

	assert_eq!(tail.bytes, expected(&file, 90_000, 10_000));
	assert_eq!(tail.total, Some(100_000));
}

#[tokio::test]
async fn a_read_starting_past_the_end_is_unsatisfiable() {
	let cdn = Cdn::of(file(100_000));
	let mut session = Session::default();
	session.read(&cdn, 0, 10).await.unwrap();

	assert_eq!(
		session.read(&cdn, 100_000, 10).await,
		Err(Failure::Refused(416))
	);
}

#[tokio::test]
async fn an_upstream_that_ignores_the_range_is_skipped_to_the_offset() {
	let file = file(1024 * 1024);
	let mut cdn = Cdn::of(Arc::clone(&file));
	cdn.ignores_ranges = true;
	let mut session = Session::default();

	let piece = session.read(&cdn, 700_000, 5000).await.unwrap();

	assert_eq!(piece.bytes, expected(&file, 700_000, 5000));
}

#[tokio::test]
async fn a_broken_upstream_fails_the_read_and_the_next_read_reopens() {
	let file = file(1024 * 1024);
	let mut cdn = Cdn::of(Arc::clone(&file));
	cdn.fail_at = Some(200_000);
	let mut session = Session::default();

	session.read(&cdn, 0, 100_000).await.unwrap();
	let broken = session.read(&cdn, 150_000, 100_000).await;
	cdn.fail_at = None;
	let retried = session.read(&cdn, 150_000, 100_000).await.unwrap();

	assert!(matches!(broken, Err(Failure::Upstream(_))));
	assert_eq!(retried.bytes, expected(&file, 150_000, 100_000));
	assert_eq!(cdn.opens(), vec![0, 150_000]);
}

#[tokio::test(start_paused = true)]
async fn opening_an_upstream_releases_cursors_left_idle_on_the_connection() {
	let file = file(20 * 1024 * 1024);
	let cdn = Cdn::of(Arc::clone(&file));
	let mut session = Session::default();

	session.read(&cdn, 0, 1024).await.unwrap();
	tokio::time::advance(OPENING_RELEASES_IDLE).await;
	session.read(&cdn, 10 * 1024 * 1024, 1024).await.unwrap();

	assert_eq!(session.cursors.len(), 1);
	let back = session.read(&cdn, 2048, 1024).await.unwrap();
	assert_eq!(back.bytes, expected(&file, 2048, 1024));
	assert_eq!(cdn.opens(), vec![0, 10 * 1024 * 1024, 2048]);
}

#[tokio::test(start_paused = true)]
async fn cursors_read_moments_apart_both_stay_open() {
	let file = file(8 * 1024 * 1024);
	let cdn = Cdn::of(Arc::clone(&file));
	let mut session = Session::default();

	session.read(&cdn, 0, 1024).await.unwrap();
	tokio::time::advance(OPENING_RELEASES_IDLE / 2).await;
	session.read(&cdn, 5 * 1024 * 1024, 400).await.unwrap();

	assert_eq!(session.cursors.len(), 2);
}

#[tokio::test(start_paused = true)]
async fn a_read_starved_by_another_live_upstream_parks_it_and_goes_on() {
	let file = file(20 * 1024 * 1024);
	let mut cdn = Cdn::of(Arc::clone(&file));
	cdn.first_holds_the_connection = Some(Arc::default());
	let mut session = Session::default();

	session.read(&cdn, 0, 1024).await.unwrap();
	let far = session.read(&cdn, 10 * 1024 * 1024, 1024).await.unwrap();

	assert_eq!(far.bytes, expected(&file, 10 * 1024 * 1024, 1024));
	assert!(session.cursors[0].chunks.is_none());
	assert_eq!(cdn.unblocks.load(Ordering::SeqCst), 1);
	let kept = session.read(&cdn, 512, 256).await.unwrap();
	assert_eq!(kept.bytes, expected(&file, 512, 256));
	assert_eq!(cdn.opens(), vec![0, 10 * 1024 * 1024]);
}
