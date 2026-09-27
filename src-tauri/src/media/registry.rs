#[cfg(target_os = "android")]
pub use tauri::wry::{
	register_stream, unregister_stream, ResponseStream, STREAM_HEADER,
};

#[cfg(all(any(test, target_os = "linux"), not(target_os = "android")))]
pub use local::with_stream;
#[cfg(not(target_os = "android"))]
pub use local::{
	register_stream, unregister_stream, ResponseStream, STREAM_HEADER,
};

#[cfg(not(target_os = "android"))]
mod local {
	use std::collections::HashMap;
	use std::io;
	use std::sync::atomic::{AtomicU64, Ordering};
	use std::sync::{Arc, LazyLock, Mutex, MutexGuard, PoisonError};

	pub const STREAM_HEADER: &str = "x-wry-stream";

	#[cfg_attr(not(test), allow(dead_code))]
	pub trait ResponseStream: Send {
		fn available(&mut self) -> io::Result<u64>;
		fn skip(&mut self, n: u64) -> io::Result<u64>;
		fn read(&mut self, buf: &mut [u8]) -> io::Result<usize>;
		fn close(&mut self);
	}

	type Entry = Arc<Mutex<Box<dyn ResponseStream>>>;

	static STREAMS: LazyLock<Mutex<HashMap<u64, Entry>>> =
		LazyLock::new(Mutex::default);
	static NEXT_ID: AtomicU64 = AtomicU64::new(1);

	fn streams() -> MutexGuard<'static, HashMap<u64, Entry>> {
		STREAMS.lock().unwrap_or_else(PoisonError::into_inner)
	}

	pub fn register_stream(stream: Box<dyn ResponseStream>) -> u64 {
		let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
		streams().insert(id, Arc::new(Mutex::new(stream)));
		id
	}

	pub fn unregister_stream(id: u64) -> bool {
		let Some(entry) = streams().remove(&id) else {
			return false;
		};
		let closed = entry.try_lock().map(|mut stream| stream.close()).is_ok();
		if !closed {
			std::thread::spawn(move || {
				if let Ok(mut stream) = entry.lock() {
					stream.close();
				}
			});
		}
		true
	}

	#[cfg(any(test, target_os = "linux"))]
	pub fn with_stream<T>(
		id: u64,
		body: impl FnOnce(&mut dyn ResponseStream) -> T,
	) -> Option<T> {
		let entry = streams().get(&id).cloned()?;
		let mut stream = entry.lock().unwrap_or_else(PoisonError::into_inner);
		Some(body(&mut **stream))
	}
}
