use tracing_subscriber::EnvFilter;

const DEFAULT_FILTER: &str = "open_grind_lib=warn,grindr=warn";

pub fn init() {
	let filter = EnvFilter::try_from_default_env()
		.unwrap_or_else(|_| EnvFilter::new(DEFAULT_FILTER));
	let builder = tracing_subscriber::fmt().with_env_filter(filter);

	#[cfg(target_os = "android")]
	let _ = builder
		.with_ansi(false)
		.without_time()
		.with_writer(logcat::Logcat)
		.try_init();

	#[cfg(not(target_os = "android"))]
	let _ = builder.try_init();
}

#[cfg(test)]
mod tests {
	use std::io;
	use std::sync::{Arc, Mutex};

	use tracing_subscriber::fmt::MakeWriter;

	use super::*;

	#[derive(Clone, Default)]
	struct Captured(Arc<Mutex<Vec<u8>>>);

	impl io::Write for Captured {
		fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
			self.0.lock().unwrap().extend_from_slice(buf);
			Ok(buf.len())
		}

		fn flush(&mut self) -> io::Result<()> {
			Ok(())
		}
	}

	impl MakeWriter<'_> for Captured {
		type Writer = Self;

		fn make_writer(&self) -> Self::Writer {
			self.clone()
		}
	}

	fn capture_with_default_filter(emit: impl FnOnce()) -> String {
		let sink = Captured::default();
		let subscriber = tracing_subscriber::fmt()
			.with_env_filter(EnvFilter::new(DEFAULT_FILTER))
			.with_ansi(false)
			.with_writer(sink.clone())
			.finish();

		tracing::subscriber::with_default(subscriber, emit);

		let bytes = sink.0.lock().unwrap().clone();
		String::from_utf8(bytes).unwrap()
	}

	#[test]
	fn default_filter_keeps_warnings_from_this_crate_and_the_grindr_crate() {
		let output = capture_with_default_filter(|| {
			tracing::warn!("[session] persist failed");
			tracing::warn!(target: "grindr::ws", "connection error");
		});

		assert!(output.contains("[session] persist failed"));
		assert!(output.contains("connection error"));
	}

	#[test]
	fn default_filter_drops_info_chatter_and_unrelated_crates() {
		let output = capture_with_default_filter(|| {
			tracing::info!("routine detail");
			tracing::info!(target: "grindr::ws", "routine detail");
			tracing::warn!(target: "wreq::connect", "third party noise");
		});

		assert_eq!(output, "");
	}
}

#[cfg(target_os = "android")]
mod logcat {
	use std::ffi::{CStr, CString};
	use std::io::{self, Write};
	use std::os::raw::{c_char, c_int};

	use tracing::{Level, Metadata};
	use tracing_subscriber::fmt::MakeWriter;

	// ndk-sys declares this but never links liblog, so bind it directly
	#[link(name = "log")]
	extern "C" {
		fn __android_log_write(
			prio: c_int,
			tag: *const c_char,
			text: *const c_char,
		) -> c_int;
	}

	const TAG: &CStr = c"OpenGrind";

	const PRIORITY_VERBOSE: c_int = 2;
	const PRIORITY_DEBUG: c_int = 3;
	const PRIORITY_INFO: c_int = 4;
	const PRIORITY_WARN: c_int = 5;
	const PRIORITY_ERROR: c_int = 6;

	pub struct LogcatWriter(c_int);

	impl Write for LogcatWriter {
		fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
			let line = String::from_utf8_lossy(buf);
			// logcat appends its own newline and rejects interior NULs
			if let Ok(message) = CString::new(line.trim_end()) {
				unsafe {
					__android_log_write(self.0, TAG.as_ptr(), message.as_ptr())
				};
			}
			Ok(buf.len())
		}

		fn flush(&mut self) -> io::Result<()> {
			Ok(())
		}
	}

	pub struct Logcat;

	impl MakeWriter<'_> for Logcat {
		type Writer = LogcatWriter;

		fn make_writer(&self) -> Self::Writer {
			LogcatWriter(PRIORITY_INFO)
		}

		fn make_writer_for(&self, meta: &Metadata<'_>) -> Self::Writer {
			LogcatWriter(match *meta.level() {
				Level::ERROR => PRIORITY_ERROR,
				Level::WARN => PRIORITY_WARN,
				Level::INFO => PRIORITY_INFO,
				Level::DEBUG => PRIORITY_DEBUG,
				Level::TRACE => PRIORITY_VERBOSE,
			})
		}
	}
}
