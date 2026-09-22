use std::io::{self, Cursor, Read, Seek, SeekFrom};

use crate::video::boxes::Span;

pub fn boxed(box_type: &[u8; 4], body: &[u8]) -> Vec<u8> {
	let mut bytes = ((body.len() + 8) as u32).to_be_bytes().to_vec();
	bytes.extend_from_slice(box_type);
	bytes.extend_from_slice(body);
	bytes
}

pub fn whole(bytes: &[u8]) -> Span {
	Span {
		start: 0,
		end: bytes.len() as u64,
	}
}

pub struct CountingReader<T> {
	inner: Cursor<T>,
	pub reads: usize,
	pub bytes_read: u64,
}

impl<T> CountingReader<T> {
	pub fn new(bytes: T) -> Self {
		Self {
			inner: Cursor::new(bytes),
			reads: 0,
			bytes_read: 0,
		}
	}
}

impl<T: AsRef<[u8]>> Read for CountingReader<T> {
	fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
		let read = self.inner.read(buf)?;
		self.reads += 1;
		self.bytes_read += read as u64;
		Ok(read)
	}
}

impl<T: AsRef<[u8]>> Seek for CountingReader<T> {
	fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
		self.inner.seek(to)
	}
}
