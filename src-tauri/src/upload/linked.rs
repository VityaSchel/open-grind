use std::fs::File;
use std::io::Write;
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;
use wreq::header::CONTENT_TYPE;
use wreq::{redirect, Client, Response};

use super::inspect::{inspect, MediaKind};
use super::media_error;
use super::staged::StagedMedia;
use crate::error::AppError;

const MAX_BYTES: u64 = 120 * 1024 * 1024;

const UNTYPED: [&str; 2] = ["application/octet-stream", "binary/octet-stream"];

const NOT_MEDIA: &str = "That link isn't a photo or video";
const TOO_LARGE: &str = "That file is too large to add";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedLink {
	id: String,
	mime_type: String,
}

fn client() -> Result<Client, AppError> {
	Client::builder()
		.https_only(true)
		.min_tls_version(wreq::tls::TlsVersion::TLS_1_2)
		.redirect(redirect::Policy::limited(3))
		.referer(false)
		.connect_timeout(Duration::from_secs(15))
		.read_timeout(Duration::from_secs(30))
		.build()
		.map_err(|error| AppError::Http(error.to_string()))
}

enum Declared {
	Media(String),
	Untyped,
}

fn declared(response: &Response) -> Option<Declared> {
	let Some(value) = response.headers().get(CONTENT_TYPE) else {
		return Some(Declared::Untyped);
	};
	let essence = value
		.to_str()
		.ok()?
		.split(';')
		.next()?
		.trim()
		.to_ascii_lowercase();
	if UNTYPED.contains(&essence.as_str()) {
		return Some(Declared::Untyped);
	}
	let media = essence != "image/svg+xml"
		&& (essence.starts_with("image/") || essence.starts_with("video/"));
	media.then_some(Declared::Media(essence))
}

fn sniffed_type(staged: &StagedMedia, id: &str) -> Option<String> {
	let mut file = File::open(staged.path(id).ok()?).ok()?;
	match inspect(&mut file).ok()?.kind {
		MediaKind::Photo => Some("image/*".to_owned()),
		MediaKind::Video => Some("video/*".to_owned()),
		MediaKind::Unsupported => None,
	}
}

fn http_error(error: wreq::Error) -> AppError {
	AppError::Http(error.to_string())
}

async fn download(
	client: &Client,
	url: &str,
	staged: &StagedMedia,
	max_bytes: u64,
) -> Result<StagedLink, AppError> {
	let mut response = client
		.get(url)
		.send()
		.await
		.and_then(Response::error_for_status)
		.map_err(http_error)?;
	let declared = declared(&response)
		.ok_or_else(|| AppError::Media(NOT_MEDIA.to_owned()))?;
	if response
		.content_length()
		.is_some_and(|length| length > max_bytes)
	{
		return Err(AppError::Media(TOO_LARGE.to_owned()));
	}
	let id = staged.create().map_err(media_error)?;
	let mut file = staged.appender(&id).map_err(media_error)?;
	let mut written = 0u64;
	let copied = async {
		while let Some(chunk) = response.chunk().await.map_err(http_error)? {
			written += chunk.len() as u64;
			if written > max_bytes {
				return Err(AppError::Media(TOO_LARGE.to_owned()));
			}
			file.write_all(&chunk).map_err(media_error)?;
		}
		Ok(())
	}
	.await;
	drop(file);
	if let Err(error) = copied {
		let _ = staged.discard(&id);
		return Err(error);
	}
	let mime_type = match declared {
		Declared::Media(mime_type) => Some(mime_type),
		Declared::Untyped => sniffed_type(staged, &id),
	};
	match mime_type {
		Some(mime_type) => Ok(StagedLink { id, mime_type }),
		None => {
			let _ = staged.discard(&id);
			Err(AppError::Media(NOT_MEDIA.to_owned()))
		}
	}
}

#[tauri::command]
pub async fn stage_linked_media(
	app: AppHandle,
	url: String,
) -> Result<StagedLink, AppError> {
	let staged = StagedMedia::of(&app).map_err(media_error)?;
	download(&client()?, &url, &staged, MAX_BYTES).await
}

#[cfg(test)]
mod tests {
	use std::sync::atomic::{AtomicUsize, Ordering};

	use tokio::io::{AsyncReadExt, AsyncWriteExt};
	use tokio::net::TcpListener;

	use super::*;

	static NEXT: AtomicUsize = AtomicUsize::new(0);

	struct TempStage(StagedMedia);

	impl TempStage {
		fn new() -> Self {
			Self(StagedMedia::at(std::env::temp_dir().join(format!(
				"og-linked-{}-{}",
				std::process::id(),
				NEXT.fetch_add(1, Ordering::Relaxed)
			))))
		}

		fn files(&self) -> usize {
			std::fs::read_dir(self.0.directory())
				.map(|entries| entries.count())
				.unwrap_or(0)
		}
	}

	impl Drop for TempStage {
		fn drop(&mut self) {
			let _ = self.0.discard_all();
		}
	}

	async fn serve(content_type: &'static str, body: Vec<u8>) -> String {
		let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
		let addr = listener.local_addr().expect("addr");
		tokio::spawn(async move {
			let Ok((mut socket, _)) = listener.accept().await else {
				return;
			};
			let mut request = [0u8; 1024];
			let _ = socket.read(&mut request).await;
			let head = format!(
				"HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
				body.len()
			);
			let _ = socket.write_all(head.as_bytes()).await;
			let _ = socket.write_all(&body).await;
		});
		format!("http://{addr}/image")
	}

	#[tokio::test]
	async fn a_linked_image_lands_in_the_stage_with_its_type() {
		let stage = TempStage::new();
		let url = serve("image/PNG; charset=binary", b"\x89PNG".to_vec()).await;

		let staged = download(&Client::new(), &url, &stage.0, MAX_BYTES)
			.await
			.expect("download");

		assert_eq!(staged.mime_type, "image/png");
		assert_eq!(
			std::fs::read(stage.0.path(&staged.id).expect("path"))
				.expect("read"),
			b"\x89PNG"
		);
	}

	#[tokio::test]
	async fn a_linked_page_is_refused_without_staging_anything() {
		let stage = TempStage::new();
		let url = serve("text/html", b"<html></html>".to_vec()).await;

		let refused = download(&Client::new(), &url, &stage.0, MAX_BYTES)
			.await
			.expect_err("refused");

		assert!(
			matches!(refused, AppError::Media(message) if message == NOT_MEDIA)
		);
		assert_eq!(stage.files(), 0);
	}

	#[tokio::test]
	async fn an_image_served_as_a_generic_binary_is_kept_once_its_bytes_say_so()
	{
		let stage = TempStage::new();
		let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
		png.resize(64, 0);
		let url = serve("binary/octet-stream", png).await;

		let staged = download(&Client::new(), &url, &stage.0, MAX_BYTES)
			.await
			.expect("download");

		assert_eq!(staged.mime_type, "image/*");
		assert_eq!(stage.files(), 1);
	}

	#[tokio::test]
	async fn a_generic_binary_that_is_no_media_is_refused_and_removed() {
		let stage = TempStage::new();
		let url =
			serve("application/octet-stream", b"just some bytes".to_vec())
				.await;

		let refused = download(&Client::new(), &url, &stage.0, MAX_BYTES)
			.await
			.expect_err("refused");

		assert!(
			matches!(refused, AppError::Media(message) if message == NOT_MEDIA)
		);
		assert_eq!(stage.files(), 0);
	}

	#[tokio::test]
	async fn an_svg_is_refused_without_downloading_it() {
		let stage = TempStage::new();
		let url = serve("image/svg+xml", b"<svg/>".to_vec()).await;

		let refused = download(&Client::new(), &url, &stage.0, MAX_BYTES)
			.await
			.expect_err("refused");

		assert!(
			matches!(refused, AppError::Media(message) if message == NOT_MEDIA)
		);
		assert_eq!(stage.files(), 0);
	}

	#[tokio::test]
	async fn a_linked_file_over_the_limit_is_refused_without_staging_anything()
	{
		let stage = TempStage::new();
		let url = serve("video/mp4", vec![0; 64]).await;

		let refused = download(&Client::new(), &url, &stage.0, 16)
			.await
			.expect_err("refused");

		assert!(
			matches!(refused, AppError::Media(message) if message == TOO_LARGE)
		);
		assert_eq!(stage.files(), 0);
	}
}
