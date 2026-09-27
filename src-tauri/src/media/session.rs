#[cfg(test)]
mod tests;

use std::collections::VecDeque;
use std::future::Future;
use std::time::Duration;

use grindr::Bytes;
use tokio::sync::OwnedSemaphorePermit;
use tokio::time::Instant;

use super::stream::{Chunks, Fault};

const CURSORS: usize = 2;
const KEPT_BEHIND: u64 = 2 * 1024 * 1024;
const REACH_AHEAD: u64 = 1024 * 1024;

pub const OPENING_RELEASES_IDLE: Duration = Duration::from_millis(250);
const STALL: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Failure {
	Refused(u16),
	Upstream(String),
}

impl From<Fault> for Failure {
	fn from(fault: Fault) -> Self {
		match fault {
			Fault::Upstream(detail) => Self::Upstream(detail),
			Fault::Abandoned => Self::Upstream("abandoned".to_owned()),
		}
	}
}

pub struct Opened<C> {
	pub total: Option<u64>,
	pub content_type: Option<String>,
	pub skip: u64,
	pub chunks: C,
	pub permit: Option<OwnedSemaphorePermit>,
}

pub trait Opener {
	type Chunks: Chunks;

	fn open(
		&self,
		from: u64,
	) -> impl Future<Output = Result<Opened<Self::Chunks>, Failure>> + Send;

	fn unblock(&self) {}
}

enum Filled {
	Done,
	Stalled,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Piece {
	pub first: u64,
	pub bytes: Vec<u8>,
	pub total: Option<u64>,
	pub content_type: Option<String>,
}

struct Cursor<C> {
	base: u64,
	kept: VecDeque<Bytes>,
	kept_len: u64,
	skip: u64,
	chunks: Option<C>,
	read_at: Instant,
	permit: Option<OwnedSemaphorePermit>,
}

impl<C: Chunks> Cursor<C> {
	fn end(&self) -> u64 {
		self.base + self.kept_len
	}

	fn reaches(&self, first: u64) -> bool {
		let held = first < self.end();
		let soon = self.chunks.is_some()
			&& first <= self.end().saturating_add(REACH_AHEAD);
		self.base <= first && (held || soon)
	}

	async fn fill(&mut self, first: u64, until: u64) -> Result<Filled, Fault> {
		while self.end() < until {
			let Some(chunks) = &mut self.chunks else {
				return Ok(Filled::Done);
			};
			let Ok(next) = tokio::time::timeout(STALL, chunks.next()).await
			else {
				return Ok(Filled::Stalled);
			};
			let Some(mut bytes) = next? else {
				self.chunks = None;
				return Ok(Filled::Done);
			};
			if self.skip > 0 {
				let skipped = self.skip.min(bytes.len() as u64);
				self.skip -= skipped;
				let _ = bytes.split_to(skipped as usize);
			}
			if !bytes.is_empty() {
				self.kept_len += bytes.len() as u64;
				self.kept.push_back(bytes);
				self.forget_before(first.saturating_sub(KEPT_BEHIND));
			}
		}
		Ok(Filled::Done)
	}

	fn park(&mut self) {
		self.chunks = None;
		self.permit = None;
	}

	fn forget_before(&mut self, offset: u64) {
		while let Some(front) = self.kept.front() {
			let front_end = self.base + front.len() as u64;
			if front_end > offset {
				return;
			}
			self.base = front_end;
			self.kept_len -= front.len() as u64;
			self.kept.pop_front();
		}
	}

	fn copy(&self, first: u64, until: u64) -> Vec<u8> {
		let until = until.min(self.end());
		let mut bytes =
			Vec::with_capacity(until.saturating_sub(first) as usize);
		let mut offset = self.base;
		for chunk in &self.kept {
			let chunk_end = offset + chunk.len() as u64;
			if chunk_end > first && offset < until {
				let from = first.saturating_sub(offset) as usize;
				let to = (until.min(chunk_end) - offset) as usize;
				bytes.extend_from_slice(&chunk[from..to]);
			}
			offset = chunk_end;
			if offset >= until {
				break;
			}
		}
		bytes
	}
}

pub struct Session<C> {
	total: Option<u64>,
	content_type: Option<String>,
	cursors: Vec<Cursor<C>>,
}

impl<C> Default for Session<C> {
	fn default() -> Self {
		Self {
			total: None,
			content_type: None,
			cursors: Vec::new(),
		}
	}
}

impl<C: Chunks> Session<C> {
	pub fn total(&self) -> Option<u64> {
		self.total
	}

	pub fn release_idle(&mut self, idle: Duration) {
		self.cursors
			.retain(|cursor| cursor.read_at.elapsed() < idle);
	}

	pub async fn read(
		&mut self,
		opener: &impl Opener<Chunks = C>,
		first: u64,
		length: u64,
	) -> Result<Piece, Failure> {
		if self.total.is_some_and(|total| first >= total) {
			return Err(Failure::Refused(416));
		}
		let index = match self.reaching(first) {
			Some(index) => index,
			None => {
				self.release_idle(OPENING_RELEASES_IDLE);
				self.open_at(opener, first).await?
			}
		};
		let until = first
			.saturating_add(length)
			.min(self.total.unwrap_or(u64::MAX));
		self.cursors[index].read_at = Instant::now();
		loop {
			match self.cursors[index].fill(first, until).await {
				Ok(Filled::Done) => break,
				Ok(Filled::Stalled) => {
					self.park_all_but(index);
					opener.unblock();
				}
				Err(fault) => {
					self.cursors.remove(index);
					return Err(fault.into());
				}
			}
		}
		let cursor = &mut self.cursors[index];
		let bytes = cursor.copy(first, until);
		cursor.forget_before(until.saturating_sub(KEPT_BEHIND));
		if bytes.is_empty() && length > 0 {
			return Err(Failure::Refused(416));
		}
		Ok(Piece {
			first,
			bytes,
			total: self.total,
			content_type: self.content_type.clone(),
		})
	}

	fn park_all_but(&mut self, keep: usize) {
		for (index, cursor) in self.cursors.iter_mut().enumerate() {
			if index != keep {
				cursor.park();
			}
		}
	}

	fn reaching(&self, first: u64) -> Option<usize> {
		self.cursors
			.iter()
			.enumerate()
			.filter(|(_, cursor)| cursor.reaches(first))
			.min_by_key(|(_, cursor)| cursor.end().abs_diff(first))
			.map(|(index, _)| index)
	}

	async fn open_at(
		&mut self,
		opener: &impl Opener<Chunks = C>,
		first: u64,
	) -> Result<usize, Failure> {
		let opened = opener.open(first).await?;
		self.total = opened.total.or(self.total);
		self.content_type = opened.content_type.or(self.content_type.take());
		let cursor = Cursor {
			base: first,
			kept: VecDeque::new(),
			kept_len: 0,
			skip: opened.skip,
			chunks: Some(opened.chunks),
			read_at: Instant::now(),
			permit: opened.permit,
		};
		if self.cursors.len() < CURSORS {
			self.cursors.push(cursor);
			return Ok(self.cursors.len() - 1);
		}
		let stalest = self
			.cursors
			.iter()
			.enumerate()
			.min_by_key(|(_, cursor)| cursor.read_at)
			.map_or(0, |(index, _)| index);
		self.cursors[stalest] = cursor;
		Ok(stalest)
	}
}
