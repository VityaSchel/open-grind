use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[derive(Clone, Default)]
pub struct Plan {
	pub body: Vec<u8>,
	pub etag: Option<String>,
	pub always_status: Option<u16>,
	pub stop_body_after: Option<usize>,
	pub refuse_range_reporting_total: Option<u64>,
	pub resume_at_wrong_offset: Option<u64>,
	pub signature_status: Option<u16>,
	pub pause_every_64k: Option<std::time::Duration>,
	pub omit_length: bool,
}

pub struct Server {
	pub addr: SocketAddr,
	pub last_range: Arc<Mutex<Option<String>>>,
	pub last_if_range: Arc<Mutex<Option<String>>>,
}

impl Server {
	pub fn url(&self) -> String {
		format!("http://{}/payload", self.addr)
	}
}

pub async fn spawn(plan: Plan) -> Server {
	let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
	let addr = listener.local_addr().expect("addr");
	let last_range = Arc::new(Mutex::new(None));
	let last_if_range = Arc::new(Mutex::new(None));

	let range_slot = last_range.clone();
	let if_range_slot = last_if_range.clone();
	tokio::spawn(async move {
		while let Ok((mut socket, _)) = listener.accept().await {
			let plan = plan.clone();
			let range_slot = range_slot.clone();
			let if_range_slot = if_range_slot.clone();
			tokio::spawn(async move {
				let Some(request) = read_request(&mut socket).await else {
					return;
				};
				if request.contains(".minisig") {
					let _ = socket
						.write_all(&signature_response(plan.signature_status))
						.await;
					let _ = socket.flush().await;
					return;
				}
				let range = header_of(&request, "range");
				let if_range = header_of(&request, "if-range");
				*range_slot.lock().unwrap() = range.clone();
				*if_range_slot.lock().unwrap() = if_range.clone();

				let response =
					answer(&plan, range.as_deref(), if_range.as_deref());
				match plan.pause_every_64k {
					None => {
						let _ = socket.write_all(&response).await;
					}
					Some(pause) => {
						for slice in response.chunks(64 * 1024) {
							if socket.write_all(slice).await.is_err() {
								return;
							}
							let _ = socket.flush().await;
							tokio::time::sleep(pause).await;
						}
					}
				}
				let _ = socket.flush().await;
			});
		}
	});

	Server {
		addr,
		last_range,
		last_if_range,
	}
}

fn signature_response(status: Option<u16>) -> Vec<u8> {
	if let Some(status) = status {
		return format!("HTTP/1.1 {status} Nope\r\ncontent-length: 0\r\n\r\n")
			.into_bytes();
	}
	let body = "untrusted comment: test\nRWQtestsignature\n";
	format!(
		"HTTP/1.1 200 OK\r\ncontent-length: {}\r\n\r\n{body}",
		body.len()
	)
	.into_bytes()
}

async fn read_request(socket: &mut tokio::net::TcpStream) -> Option<String> {
	let mut request = Vec::new();
	let mut buffer = [0u8; 1024];
	while !request.windows(4).any(|w| w == b"\r\n\r\n") {
		match socket.read(&mut buffer).await {
			Ok(0) | Err(_) => return None,
			Ok(n) => request.extend_from_slice(&buffer[..n]),
		}
	}
	Some(String::from_utf8_lossy(&request).to_lowercase())
}

fn header_of(request: &str, name: &str) -> Option<String> {
	request.lines().find_map(|line| {
		let (key, value) = line.split_once(':')?;
		(key.trim() == name).then(|| value.trim().to_owned())
	})
}

fn answer(plan: &Plan, range: Option<&str>, if_range: Option<&str>) -> Vec<u8> {
	if let Some(status) = plan.always_status {
		return head(status, "", Some(0), plan.etag.as_deref());
	}

	let total = plan.body.len() as u64;
	let validator_still_matches = match (if_range, plan.etag.as_deref()) {
		(Some(sent), Some(current)) => sent.eq_ignore_ascii_case(current),
		(Some(_), None) => false,
		(None, _) => true,
	};
	let start = range
		.filter(|_| validator_still_matches)
		.and_then(requested_start);

	let Some(start) = start else {
		let mut response =
			head(200, "", declared(plan, total), plan.etag.as_deref());
		response.extend_from_slice(&body(plan, &plan.body));
		return response;
	};

	if let Some(reported) = plan.refuse_range_reporting_total {
		return head(
			416,
			&format!("bytes */{reported}"),
			Some(0),
			plan.etag.as_deref(),
		);
	}

	let from = plan.resume_at_wrong_offset.unwrap_or(start).min(total);
	let slice = &plan.body[from as usize..];
	let content_range =
		format!("bytes {from}-{}/{total}", total.saturating_sub(1));
	let mut response = head(
		206,
		&content_range,
		declared(plan, slice.len() as u64),
		plan.etag.as_deref(),
	);
	response.extend_from_slice(&body(plan, slice));
	response
}

fn requested_start(range: &str) -> Option<u64> {
	range
		.trim()
		.strip_prefix("bytes=")?
		.split('-')
		.next()?
		.parse()
		.ok()
}

fn body(plan: &Plan, bytes: &[u8]) -> Vec<u8> {
	let mut body = bytes.to_vec();
	if let Some(cut) = plan.stop_body_after {
		body.truncate(cut);
	}
	body
}

fn declared(plan: &Plan, length: u64) -> Option<u64> {
	(!plan.omit_length).then_some(length)
}

fn head(
	status: u16,
	content_range: &str,
	length: Option<u64>,
	etag: Option<&str>,
) -> Vec<u8> {
	let reason = match status {
		200 => "OK",
		206 => "Partial Content",
		416 => "Range Not Satisfiable",
		500 => "Internal Server Error",
		_ => "Error",
	};
	let mut head = format!("HTTP/1.1 {status} {reason}\r\n");
	if let Some(length) = length {
		head.push_str(&format!("Content-Length: {length}\r\n"));
	}
	if !content_range.is_empty() {
		head.push_str(&format!("Content-Range: {content_range}\r\n"));
	}
	if let Some(etag) = etag {
		head.push_str(&format!("ETag: {etag}\r\n"));
	}
	head.push_str("Accept-Ranges: bytes\r\nConnection: close\r\n\r\n");
	head.into_bytes()
}
