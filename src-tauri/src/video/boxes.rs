use std::io::{self, Read, Seek, SeekFrom};

const HEADER_LEN: u64 = 8;
const LARGE_SIZE_LEN: u64 = 8;
const FULL_BOX_LEN: u64 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
	pub start: u64,
	pub end: u64,
}

impl Span {
	pub fn size(&self) -> u64 {
		self.end.saturating_sub(self.start)
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Located {
	pub box_type: [u8; 4],
	pub start: u64,
	pub header_len: u64,
	pub body: Span,
}

impl Located {
	pub fn is(&self, box_type: &[u8; 4]) -> bool {
		&self.box_type == box_type
	}

	pub fn payload_start(&self) -> u64 {
		self.start + self.header_len
	}
}

pub fn read_at<R: Read + Seek>(
	reader: &mut R,
	at: u64,
	buf: &mut [u8],
) -> io::Result<()> {
	reader.seek(SeekFrom::Start(at))?;
	reader.read_exact(buf)
}

pub fn header<R: Read + Seek>(
	reader: &mut R,
	within: Span,
) -> io::Result<Option<Located>> {
	let Some(raw) = raw_header(reader, within)? else {
		return Ok(None);
	};
	if raw.total > within.size() {
		return Ok(None);
	}
	Ok(Some(located(reader, within.start, raw)?))
}

pub fn children<R: Read + Seek>(
	reader: &mut R,
	within: Span,
) -> io::Result<Vec<Located>> {
	let mut found = Vec::new();
	walk(reader, within, |child| {
		found.push(child);
		true
	})?;
	Ok(found)
}

fn walk<R: Read + Seek>(
	reader: &mut R,
	within: Span,
	mut visit: impl FnMut(Located) -> bool,
) -> io::Result<()> {
	let mut at = within.start;
	while at < within.end {
		let Some(raw) = raw_header(
			reader,
			Span {
				start: at,
				end: within.end,
			},
		)?
		else {
			break;
		};
		let available = within.end - at;
		let raw = raw.clamped(available);
		if !visit(located(reader, at, raw)?) {
			break;
		}
		at += raw.total;
	}
	Ok(())
}

#[derive(Debug, Clone, Copy)]
struct RawHeader {
	box_type: [u8; 4],
	header_len: u64,
	total: u64,
}

impl RawHeader {
	fn clamped(self, available: u64) -> Self {
		Self {
			total: self.total.min(available),
			..self
		}
	}
}

fn raw_header<R: Read + Seek>(
	reader: &mut R,
	within: Span,
) -> io::Result<Option<RawHeader>> {
	if within.size() < HEADER_LEN {
		return Ok(None);
	}
	let mut header = [0u8; HEADER_LEN as usize];
	read_at(reader, within.start, &mut header)?;
	let box_type = four(&header[4..]);
	let declared = u32::from_be_bytes(four(&header[..4])) as u64;
	let (header_len, total) = match declared {
		0 => (HEADER_LEN, within.size()),
		1 => {
			let mut large = [0u8; LARGE_SIZE_LEN as usize];
			read_at(reader, within.start + HEADER_LEN, &mut large)?;
			(HEADER_LEN + LARGE_SIZE_LEN, u64::from_be_bytes(large))
		}
		size => (HEADER_LEN, size),
	};
	if total < header_len {
		return Ok(None);
	}
	Ok(Some(RawHeader {
		box_type,
		header_len,
		total,
	}))
}

fn located<R: Read + Seek>(
	reader: &mut R,
	at: u64,
	raw: RawHeader,
) -> io::Result<Located> {
	let end = at + raw.total;
	let mut body_start = at + raw.header_len;
	if &raw.box_type == b"meta" && has_version_and_flags(reader, body_start)? {
		body_start += FULL_BOX_LEN;
	}
	Ok(Located {
		box_type: raw.box_type,
		start: at,
		header_len: raw.header_len,
		body: Span {
			start: body_start.min(end),
			end,
		},
	})
}

pub fn find<R: Read + Seek>(
	reader: &mut R,
	within: Span,
	box_type: &[u8; 4],
) -> io::Result<Option<Located>> {
	let mut found = None;
	walk(reader, within, |child| {
		if !child.is(box_type) {
			return true;
		}
		found = Some(child);
		false
	})?;
	Ok(found)
}

pub fn find_path<R: Read + Seek>(
	reader: &mut R,
	within: Span,
	path: &[[u8; 4]],
) -> io::Result<Option<Located>> {
	let mut span = within;
	let mut found = None;
	for box_type in path {
		let Some(child) = find(reader, span, box_type)? else {
			return Ok(None);
		};
		span = child.body;
		found = Some(child);
	}
	Ok(found)
}

fn has_version_and_flags<R: Read + Seek>(
	reader: &mut R,
	body_start: u64,
) -> io::Result<bool> {
	let mut peek = [0u8; HEADER_LEN as usize];
	reader.seek(SeekFrom::Start(body_start))?;
	let mut filled = 0;
	while filled < peek.len() {
		let read = reader.read(&mut peek[filled..])?;
		if read == 0 {
			break;
		}
		filled += read;
	}
	Ok(filled == peek.len() && !looks_like_box_type(&peek[4..]))
}

fn looks_like_box_type(bytes: &[u8]) -> bool {
	bytes.iter().all(|byte| (0x20..=0x7e).contains(byte))
}

fn four(bytes: &[u8]) -> [u8; 4] {
	bytes[..4].try_into().expect("four bytes")
}

#[cfg(test)]
mod tests {
	use std::io::Cursor;

	use super::*;

	fn boxed(box_type: &[u8; 4], body: &[u8]) -> Vec<u8> {
		let mut bytes = ((body.len() + 8) as u32).to_be_bytes().to_vec();
		bytes.extend_from_slice(box_type);
		bytes.extend_from_slice(body);
		bytes
	}

	fn whole(bytes: &[u8]) -> Span {
		Span {
			start: 0,
			end: bytes.len() as u64,
		}
	}

	#[test]
	fn walks_siblings_and_reports_their_bodies() {
		let mut bytes = boxed(b"ftyp", b"isom");
		bytes.extend(boxed(b"free", b""));
		bytes.extend(boxed(b"mdat", b"payload"));
		let span = whole(&bytes);

		let found = children(&mut Cursor::new(&bytes), span).expect("children");

		assert_eq!(
			found
				.iter()
				.map(|child| (child.box_type, child.body.size()))
				.collect::<Vec<_>>(),
			vec![(*b"ftyp", 4), (*b"free", 0), (*b"mdat", 7)]
		);
	}

	#[test]
	fn a_size_of_one_reads_the_largesize_that_follows() {
		let mut bytes = 1u32.to_be_bytes().to_vec();
		bytes.extend_from_slice(b"mdat");
		bytes.extend_from_slice(&24u64.to_be_bytes());
		bytes.extend_from_slice(b"12345678");
		bytes.extend(boxed(b"moov", b""));
		let span = whole(&bytes);

		let found = children(&mut Cursor::new(&bytes), span).expect("children");

		assert_eq!(found[0].box_type, *b"mdat");
		assert_eq!(found[0].body, Span { start: 16, end: 24 });
		assert_eq!(found[1].box_type, *b"moov");
	}

	#[test]
	fn a_size_of_zero_runs_to_the_end_of_the_span() {
		let mut bytes = 0u32.to_be_bytes().to_vec();
		bytes.extend_from_slice(b"mdat");
		bytes.extend_from_slice(b"tail bytes");
		let span = whole(&bytes);

		let found = children(&mut Cursor::new(&bytes), span).expect("children");

		assert_eq!(found.len(), 1);
		assert_eq!(found[0].body, Span { start: 8, end: 18 });
	}

	#[test]
	fn an_iso_meta_box_skips_its_version_and_flags() {
		let mut body = vec![0u8; 4];
		body.extend(boxed(b"hdlr", b"handler"));
		let bytes = boxed(b"meta", &body);
		let span = whole(&bytes);

		let found = children(&mut Cursor::new(&bytes), span).expect("children");
		let inner =
			children(&mut Cursor::new(&bytes), found[0].body).expect("inner");

		assert_eq!(found[0].body.start, 12);
		assert_eq!(inner[0].box_type, *b"hdlr");
	}

	#[test]
	fn a_quicktime_meta_box_starts_at_its_first_child() {
		let bytes = boxed(b"meta", &boxed(b"hdlr", b"handler"));
		let span = whole(&bytes);

		let found = children(&mut Cursor::new(&bytes), span).expect("children");
		let inner =
			children(&mut Cursor::new(&bytes), found[0].body).expect("inner");

		assert_eq!(found[0].body.start, 8);
		assert_eq!(inner[0].box_type, *b"hdlr");
	}

	#[test]
	fn a_box_shorter_than_its_header_stops_the_walk() {
		let mut bytes = 4u32.to_be_bytes().to_vec();
		bytes.extend_from_slice(b"junk");
		bytes.extend(boxed(b"moov", b""));
		let span = whole(&bytes);

		let found = children(&mut Cursor::new(&bytes), span).expect("children");

		assert!(found.is_empty());
	}

	#[test]
	fn a_box_running_past_the_span_is_clamped() {
		let mut bytes = 999u32.to_be_bytes().to_vec();
		bytes.extend_from_slice(b"mdat");
		bytes.extend_from_slice(b"short");
		let span = whole(&bytes);

		let found = children(&mut Cursor::new(&bytes), span).expect("children");

		assert_eq!(found[0].body, Span { start: 8, end: 13 });
	}

	#[test]
	fn a_largesize_that_overflows_the_cursor_stops_the_walk() {
		let mut bytes = boxed(b"ftyp", b"isom");
		bytes.extend_from_slice(&1u32.to_be_bytes());
		bytes.extend_from_slice(b"mdat");
		bytes.extend_from_slice(&u64::MAX.to_be_bytes());
		bytes.extend_from_slice(&[0u8; 32]);
		let span = whole(&bytes);

		let found = children(&mut Cursor::new(&bytes), span).expect("children");

		assert_eq!(
			found.iter().map(|child| child.box_type).collect::<Vec<_>>(),
			vec![*b"ftyp", *b"mdat"]
		);
		assert_eq!(found[1].body.end, bytes.len() as u64);
	}

	#[test]
	fn find_stops_at_the_first_match_instead_of_walking_on() {
		let mut bytes = boxed(b"moov", b"first");
		for _ in 0..1000 {
			bytes.extend(boxed(b"free", b"padding"));
		}
		let span = whole(&bytes);
		let mut reader = CountingReader {
			inner: Cursor::new(bytes.clone()),
			reads: 0,
		};

		let found = find(&mut reader, span, b"moov")
			.expect("walk")
			.expect("moov");

		assert_eq!(found.body.size(), 5);
		assert!(reader.reads < 4, "read {} headers", reader.reads);
	}

	#[test]
	fn find_path_descends_through_containers() {
		let stbl = boxed(b"stbl", &boxed(b"stsd", b"entries"));
		let minf = boxed(b"minf", &stbl);
		let mdia = boxed(b"mdia", &minf);
		let span = whole(&mdia);
		let mut reader = Cursor::new(&mdia);

		let found = find_path(
			&mut reader,
			span,
			&[*b"mdia", *b"minf", *b"stbl", *b"stsd"],
		)
		.expect("walk")
		.expect("stsd");
		let missing =
			find_path(&mut reader, span, &[*b"mdia", *b"stts"]).expect("walk");

		assert_eq!(found.box_type, *b"stsd");
		assert_eq!(found.body.size(), 7);
		assert!(missing.is_none());
	}

	struct CountingReader {
		inner: Cursor<Vec<u8>>,
		reads: usize,
	}

	impl Read for CountingReader {
		fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
			self.reads += 1;
			self.inner.read(buf)
		}
	}

	impl Seek for CountingReader {
		fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
			self.inner.seek(to)
		}
	}
}
