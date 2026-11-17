#[cfg(test)]
mod ending_tests;
mod queue;
#[cfg(test)]
mod tests;

use std::io;

use grindr::Bytes;
use tokio::sync::mpsc::Receiver;
use tokio::sync::oneshot;

use super::super::registry::ResponseStream;
use super::answer::Placement;
use super::fault::Chunk;
use queue::Queue;

pub const CHANNEL_SLOTS: usize = 64;

fn clamped(bytes: u64) -> usize {
	usize::try_from(bytes).unwrap_or(usize::MAX)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Gate {
	Open,
	Closed,
	Poisoned,
}

pub struct WebViewStream {
	queue: Queue,
	cancel: Option<oneshot::Sender<()>>,
	gate: Gate,
	advertised: u64,
	length: u64,
	origin: u64,
	drop: u64,
	pos: u64,
	consumed: u64,
	sized: bool,
}

impl WebViewStream {
	pub fn streaming(
		rx: Receiver<Chunk>,
		cancel: oneshot::Sender<()>,
		placement: Placement,
	) -> Self {
		let mut stream = Self::blank();
		stream.queue = Queue::fed_by(rx);
		stream.cancel = Some(cancel);
		stream.advertised = placement.length;
		stream.length = placement.length;
		stream.origin = placement.origin;
		stream.drop = placement.drop;
		stream
	}

	pub fn empty_at(at: u64) -> Self {
		let mut stream = Self::blank();
		stream.advertised = at.saturating_add(1);
		stream.length = at;
		stream.origin = at;
		stream
	}

	pub fn poisoned() -> Self {
		let mut stream = Self::blank();
		stream.gate = Gate::Poisoned;
		stream
	}

	fn blank() -> Self {
		Self {
			queue: Queue::default(),
			cancel: None,
			gate: Gate::Open,
			advertised: 0,
			length: 0,
			origin: 0,
			drop: 0,
			pos: 0,
			consumed: 0,
			sized: false,
		}
	}

	fn open(&self) -> io::Result<()> {
		match self.gate {
			Gate::Open => Ok(()),
			Gate::Closed => {
				Err(io::Error::new(io::ErrorKind::BrokenPipe, "stream closed"))
			}
			Gate::Poisoned => Err(io::Error::other("stream poisoned")),
		}
	}

	fn take(&mut self, mut bytes: Bytes, at_most: usize) -> Bytes {
		let taken = bytes.split_to(bytes.len().min(at_most));
		if !bytes.is_empty() {
			self.queue.give_back(bytes);
		}
		self.consumed += taken.len() as u64;
		taken
	}

	fn catch_up(&mut self) -> io::Result<()> {
		while self.origin.saturating_add(self.consumed) < self.pos {
			let behind = self.pos - (self.origin + self.consumed);
			let Some(bytes) = self.queue.pull()? else {
				return Err(io::Error::new(
					io::ErrorKind::UnexpectedEof,
					"body ended before the requested byte",
				));
			};
			self.take(bytes, clamped(behind));
		}
		Ok(())
	}

	fn at_end(&self) -> bool {
		self.length == 0 || self.pos == self.length
	}
}

#[cfg_attr(any(target_os = "ios", desktop), allow(dead_code))]
impl ResponseStream for WebViewStream {
	fn available(&mut self) -> io::Result<u64> {
		self.open()?;
		if !self.sized {
			self.sized = true;
			if self.advertised > 0 {
				return Ok(self.advertised);
			}
		}
		Ok(self.queue.ready())
	}

	fn skip(&mut self, n: u64) -> io::Result<u64> {
		self.open()?;
		let virtual_end = self.origin.saturating_add(self.drop);
		let mut skipped = n.min(virtual_end.saturating_sub(self.pos));
		self.pos += skipped;
		while skipped < n {
			self.catch_up()?;
			let Some(bytes) = self.queue.pull()? else {
				break;
			};
			let taken = self.take(bytes, clamped(n - skipped)).len() as u64;
			self.pos += taken;
			skipped += taken;
		}
		Ok(skipped)
	}

	fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
		self.open()?;
		if buf.is_empty() {
			return Ok(0);
		}
		if self.pos < self.origin {
			return Err(io::Error::new(
				io::ErrorKind::InvalidInput,
				"read before the stream's first byte",
			));
		}
		if self.length > 0 && self.pos >= self.length {
			return Ok(0);
		}
		self.catch_up()?;
		let room = match self.length {
			0 => buf.len(),
			length => buf.len().min(clamped(length - self.pos)),
		};
		match self.queue.pull()? {
			Some(bytes) => {
				let taken = self.take(bytes, room);
				buf[..taken.len()].copy_from_slice(&taken);
				self.pos += taken.len() as u64;
				Ok(taken.len())
			}
			None if self.at_end() => Ok(0),
			None => Err(io::Error::new(
				io::ErrorKind::UnexpectedEof,
				"body ended early",
			)),
		}
	}

	fn close(&mut self) {
		self.gate = Gate::Closed;
		self.queue.close();
		if let Some(cancel) = self.cancel.take() {
			let _ = cancel.send(());
		}
	}
}

impl Drop for WebViewStream {
	fn drop(&mut self) {
		self.close();
	}
}
