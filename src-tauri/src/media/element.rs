use std::io::Write;
use std::os::fd::{FromRawFd, OwnedFd};
use std::os::unix::net::UnixStream;

use tauri::http::{Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use webkit2gtk::gio::prelude::UnixFDListExtManual;
use webkit2gtk::{UserMessage, UserMessageExt, WebContextExt, WebViewExt};

use super::registry::{unregister_stream, with_stream, STREAM_HEADER};
use super::response::refused;
use super::stream::serve_streamed;
use super::target::{decode_target, Target};

pub const WEBKIT_EXTENSIONS: &str = "webkit-extensions";
const OPEN_MESSAGE: &str = "ogmedia-open";
const PIECE: usize = 64 * 1024;

struct Open {
	uri: String,
	offset: u64,
	socket: UnixStream,
}

impl Open {
	fn from_message(message: &UserMessage) -> Option<Self> {
		let (uri, offset) = message.parameters()?.get::<(String, u64)>()?;
		let fds: Vec<OwnedFd> = message
			.fd_list()?
			.steal_fds()
			.into_iter()
			.map(|fd| unsafe { OwnedFd::from_raw_fd(fd) })
			.collect();
		let socket = UnixStream::from(fds.into_iter().next()?);
		Some(Self {
			uri,
			offset,
			socket,
		})
	}
}

pub fn serve_element_opens<R: Runtime>(window: &WebviewWindow<R>) {
	let app = window.app_handle().clone();
	let dispatched = window.with_webview(move |webview| {
		let Some(context) = webview.inner().context() else {
			return;
		};
		context.connect_user_message_received(move |_, message| {
			if message.name().as_deref() != Some(OPEN_MESSAGE) {
				return false;
			}
			if let Some(open) = Open::from_message(message) {
				tauri::async_runtime::spawn(feed(app.clone(), open));
			}
			true
		});
	});
	if let Err(error) = dispatched {
		tracing::warn!("[media] cannot serve the video element: {error}");
	}
}

fn target_of(uri: &str) -> Option<Target> {
	let rest = uri.strip_prefix("ogmedia://")?;
	let path = &rest[rest.find('/')?..];
	decode_target(path.split(['#', '?']).next().unwrap_or(path))
}

async fn feed<R: Runtime>(app: AppHandle<R>, open: Open) {
	let range = (open.offset > 0).then(|| format!("bytes={}-", open.offset));
	let response = match target_of(&open.uri) {
		Some(Target { url, fetcher }) => {
			serve_streamed(&app, &url, fetcher, range.as_deref()).await
		}
		None => refused(StatusCode::BAD_REQUEST),
	};
	let delivered = tauri::async_runtime::spawn_blocking(move || {
		deliver(&response, open.offset, open.socket)
	});
	let _ = delivered.await;
}

fn deliver(response: &Response<Vec<u8>>, offset: u64, mut socket: UnixStream) {
	let status = response.status().as_u16();
	let stream = response
		.headers()
		.get(STREAM_HEADER)
		.and_then(|value| value.to_str().ok()?.parse::<u64>().ok());
	let size = stream
		.and_then(|id| with_stream(id, |stream| stream.available()).ok())
		.unwrap_or(0);
	let mut header = [0; 16];
	header[..8].copy_from_slice(&u64::from(status).to_le_bytes());
	header[8..].copy_from_slice(&size.to_le_bytes());
	if socket.write_all(&header).is_ok() && matches!(status, 200 | 206) {
		if let Some(id) = stream.filter(|&id| skip_to(id, offset)) {
			pipe(id, &mut socket);
		}
	}
	if let Some(id) = stream {
		unregister_stream(id);
	}
}

fn skip_to(id: u64, offset: u64) -> bool {
	let mut skipped = 0;
	while skipped < offset {
		match with_stream(id, |stream| stream.skip(offset - skipped)) {
			Ok(0) | Err(_) => return false,
			Ok(n) => skipped += n,
		}
	}
	true
}

fn pipe(id: u64, socket: &mut UnixStream) {
	let mut piece = vec![0; PIECE];
	loop {
		let Ok(length) = with_stream(id, |stream| stream.read(&mut piece))
		else {
			return;
		};
		if length == 0 || socket.write_all(&piece[..length]).is_err() {
			return;
		}
	}
}

#[cfg(test)]
mod tests {
	use std::io::{self, Read};

	use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};

	use super::super::registry::{register_stream, ResponseStream};
	use super::*;

	const VIDEO: &str = "https://cdns.grindr.com/video/a.mp4";

	struct Fixed {
		body: Vec<u8>,
		sent: usize,
	}

	impl ResponseStream for Fixed {
		fn available(&mut self) -> io::Result<u64> {
			Ok(self.body.len() as u64)
		}

		fn skip(&mut self, n: u64) -> io::Result<u64> {
			let skipped = (self.body.len() - self.sent).min(n as usize);
			self.sent += skipped;
			Ok(skipped as u64)
		}

		fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
			let rest = &self.body[self.sent..];
			let length = rest.len().min(buf.len());
			buf[..length].copy_from_slice(&rest[..length]);
			self.sent += length;
			Ok(length)
		}

		fn close(&mut self) {}
	}

	fn received(
		response: Response<Vec<u8>>,
		offset: u64,
	) -> (u64, u64, Vec<u8>) {
		let (ours, mut theirs) = UnixStream::pair().unwrap();
		deliver(&response, offset, ours);
		let mut all = Vec::new();
		theirs.read_to_end(&mut all).unwrap();
		let status = u64::from_le_bytes(all[..8].try_into().unwrap());
		let size = u64::from_le_bytes(all[8..16].try_into().unwrap());
		(status, size, all[16..].to_vec())
	}

	fn streaming(status: u16, body: &[u8]) -> Response<Vec<u8>> {
		let id = register_stream(Box::new(Fixed {
			body: body.to_vec(),
			sent: 0,
		}));
		Response::builder()
			.status(status)
			.header(STREAM_HEADER, id)
			.body(Vec::new())
			.unwrap()
	}

	#[test]
	fn the_uri_the_player_opens_decodes_without_its_fragment_or_query() {
		let encoded = URL_SAFE_NO_PAD.encode(VIDEO);
		for uri in [
			format!("ogmedia://localhost/v{encoded}"),
			format!("ogmedia://localhost/v{encoded}#t=0.001"),
			format!("ogmedia://localhost/v{encoded}?preview"),
		] {
			let target = target_of(&uri).expect(&uri);
			assert_eq!(target.url, VIDEO);
			assert_eq!(target.fetcher, grindr::MediaFetcher::MediaPlayer);
		}
	}

	#[test]
	fn only_ogmedia_uris_are_served() {
		let encoded = URL_SAFE_NO_PAD.encode(VIDEO);
		assert!(target_of(&format!("http://localhost/v{encoded}")).is_none());
		assert!(target_of("ogmedia://localhost").is_none());
	}

	#[test]
	fn a_stream_arrives_after_its_status_and_total_size() {
		let (status, size, body) =
			received(streaming(206, b"moov and mdat"), 0);

		assert_eq!((status, size), (206, 13));
		assert_eq!(body, b"moov and mdat");
	}

	#[test]
	fn a_seek_receives_the_bytes_from_its_offset() {
		let (status, size, body) = received(streaming(200, b"0123456789"), 6);

		assert_eq!((status, size), (200, 10));
		assert_eq!(body, b"6789");
	}

	#[test]
	fn a_refusal_sends_only_its_status() {
		let (status, size, body) = received(refused(StatusCode::FORBIDDEN), 0);

		assert_eq!((status, size), (403, 0));
		assert!(body.is_empty());
	}

	#[test]
	fn a_failed_answer_never_sends_the_stream_it_carries() {
		let (status, _, body) = received(streaming(502, b"never sent"), 0);

		assert_eq!(status, 502);
		assert!(body.is_empty());
	}
}
