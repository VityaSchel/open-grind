use wreq::header::{HeaderValue, IF_RANGE, RANGE};
use wreq::{Client, StatusCode};

use super::super::client;
use super::super::error::UpdateError;
use super::super::storage::{Stage, Staged};
use super::stage::{resume_offset, truncate};

pub(super) enum Opening {
	Body(wreq::Response, u64),
	Complete,
}

pub(super) async fn open(
	client: &Client,
	stage: &Stage,
	staged: &mut Staged,
) -> Result<Opening, UpdateError> {
	let mut written = resume_offset(&stage.part(), staged.downloaded)?;
	staged.downloaded = written;

	let mut request = client::get(client, &staged.payload_url);
	if written > 0 {
		request = request.header(RANGE, format!("bytes={written}-"));
		if let Some(validator) = &staged.validator {
			if let Ok(value) = HeaderValue::from_str(validator) {
				request = request.header(IF_RANGE, value);
			}
		}
	}

	let response = request
		.send()
		.await
		.map_err(|e| UpdateError::Network(e.to_string()))?;

	match response.status() {
		StatusCode::PARTIAL_CONTENT => {
			let range =
				content_range(&response_header(&response, "content-range"))
					.ok_or_else(|| {
						UpdateError::Network("unreadable content-range".into())
					})?;
			if range.total != staged.payload_size {
				return Err(replaced(stage));
			}
			if range.start != written {
				return restart(
					stage,
					staged,
					"server resumed at a different offset",
				);
			}
			Ok(Opening::Body(response, written))
		}
		StatusCode::OK => {
			if response
				.content_length()
				.is_some_and(|declared| declared != staged.payload_size)
			{
				return Err(replaced(stage));
			}
			if written > 0 {
				truncate(&stage.part())?;
				written = 0;
				staged.downloaded = 0;
			}
			staged.validator = validator_of(&response);
			Ok(Opening::Body(response, written))
		}
		StatusCode::RANGE_NOT_SATISFIABLE => {
			let total =
				content_range(&response_header(&response, "content-range"))
					.map(|r| r.total);
			if written == staged.payload_size
				&& total == Some(staged.payload_size)
			{
				return Ok(Opening::Complete);
			}
			restart(stage, staged, "server rejected the resume offset")
		}
		status => Err(UpdateError::Server {
			status: status.as_u16(),
		}),
	}
}

fn replaced(stage: &Stage) -> UpdateError {
	let _ = stage.discard();
	UpdateError::AssetReplaced
}

fn restart(
	stage: &Stage,
	staged: &mut Staged,
	why: &str,
) -> Result<Opening, UpdateError> {
	truncate(&stage.part())?;
	staged.downloaded = 0;
	staged.validator = None;
	stage.save(staged)?;
	Err(UpdateError::Network(format!("{why}, restarting")))
}

fn response_header(response: &wreq::Response, name: &str) -> String {
	response
		.headers()
		.get(name)
		.and_then(|value| value.to_str().ok())
		.unwrap_or_default()
		.to_owned()
}

fn validator_of(response: &wreq::Response) -> Option<String> {
	let etag = response_header(response, "etag");
	if !etag.is_empty() {
		return Some(etag);
	}
	let modified = response_header(response, "last-modified");
	(!modified.is_empty()).then_some(modified)
}

#[derive(Debug, PartialEq, Eq)]
struct ContentRange {
	start: u64,
	total: u64,
}

fn content_range(value: &str) -> Option<ContentRange> {
	let rest = value.trim().strip_prefix("bytes ")?;
	let (range, total) = rest.split_once('/')?;
	let total = total.trim().parse().ok()?;
	if range.trim() == "*" {
		return Some(ContentRange { start: 0, total });
	}
	let (start, _end) = range.split_once('-')?;
	Some(ContentRange {
		start: start.trim().parse().ok()?,
		total,
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn reads_the_offset_and_total_out_of_a_content_range() {
		assert_eq!(
			content_range("bytes 1000000-1000099/72294080"),
			Some(ContentRange {
				start: 1000000,
				total: 72294080
			})
		);
		assert_eq!(
			content_range("bytes */72294080"),
			Some(ContentRange {
				start: 0,
				total: 72294080
			})
		);
	}

	#[test]
	fn refuses_content_ranges_it_cannot_trust() {
		for value in
			["", "items 0-1/2", "bytes 0-1", "bytes 0-1/abc", "bytes/2"]
		{
			assert_eq!(content_range(value), None, "accepted {value}");
		}
	}
}
