use std::io::{self, Read, Seek, SeekFrom};

use crate::video::boxes::{children, find, find_path, read_at, Located, Span};

const SAMPLE_ENTRY_DIMENSIONS: u64 = 24;
const TKHD_MATRIX_V0: u64 = 40;
const TKHD_MATRIX_V1: u64 = 52;
const MATRIX_LEN: u64 = 36;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Probe {
	pub width: u32,
	pub height: u32,
	pub duration_ms: u64,
}

pub fn probe<R: Read + Seek>(reader: &mut R) -> io::Result<Option<Probe>> {
	let end = reader.seek(SeekFrom::End(0))?;
	let Some(moov) = find(reader, Span { start: 0, end }, b"moov")? else {
		return Ok(None);
	};
	let duration_ms = movie_duration_ms(reader, moov.body)?.unwrap_or_default();
	for trak in children(reader, moov.body)?
		.into_iter()
		.filter(|child| child.is(b"trak"))
	{
		let Some((width, height)) = visual_size(reader, trak)? else {
			continue;
		};
		return Ok(Some(Probe {
			width,
			height,
			duration_ms,
		}));
	}
	Ok(None)
}

fn movie_duration_ms<R: Read + Seek>(
	reader: &mut R,
	moov: Span,
) -> io::Result<Option<u64>> {
	let Some(mvhd) = find(reader, moov, b"mvhd")? else {
		return Ok(None);
	};
	let mut version = [0u8; 4];
	read_at(reader, mvhd.body.start, &mut version)?;
	let (timescale, duration, unknown) = if version[0] == 1 {
		let mut fields = [0u8; 28];
		read_at(reader, mvhd.body.start + 4, &mut fields)?;
		(u32_at(&fields, 16), u64_at(&fields, 20), u64::MAX)
	} else {
		let mut fields = [0u8; 16];
		read_at(reader, mvhd.body.start + 4, &mut fields)?;
		(
			u32_at(&fields, 8),
			u64::from(u32_at(&fields, 12)),
			u64::from(u32::MAX),
		)
	};
	if timescale == 0 || duration == unknown {
		return Ok(None);
	}
	Ok(Some(duration.saturating_mul(1000) / u64::from(timescale)))
}

fn visual_size<R: Read + Seek>(
	reader: &mut R,
	trak: Located,
) -> io::Result<Option<(u32, u32)>> {
	let Some(mdia) = find(reader, trak.body, b"mdia")? else {
		return Ok(None);
	};
	if !is_visual_handler(reader, mdia.body)? {
		return Ok(None);
	}
	let Some(stsd) =
		find_path(reader, mdia.body, &[*b"minf", *b"stbl", *b"stsd"])?
	else {
		return Ok(None);
	};
	let entries = Span {
		start: stsd.body.start + 8,
		end: stsd.body.end,
	};
	if entries.start > entries.end {
		return Ok(None);
	}
	let Some(entry) = children(reader, entries)?.into_iter().next() else {
		return Ok(None);
	};
	if entry.body.size() < SAMPLE_ENTRY_DIMENSIONS + 4 {
		return Ok(None);
	}
	let mut dimensions = [0u8; 4];
	read_at(
		reader,
		entry.body.start + SAMPLE_ENTRY_DIMENSIONS,
		&mut dimensions,
	)?;
	let width = u32::from(u16_at(&dimensions, 0));
	let height = u32::from(u16_at(&dimensions, 2));
	if width == 0 || height == 0 {
		return Ok(None);
	}
	if quarter_turn(reader, trak)? {
		return Ok(Some((height, width)));
	}
	Ok(Some((width, height)))
}

fn quarter_turn<R: Read + Seek>(
	reader: &mut R,
	trak: Located,
) -> io::Result<bool> {
	let Some(tkhd) = find(reader, trak.body, b"tkhd")? else {
		return Ok(false);
	};
	let mut version = [0u8; 4];
	read_at(reader, tkhd.body.start, &mut version)?;
	let at = tkhd.body.start
		+ if version[0] == 1 {
			TKHD_MATRIX_V1
		} else {
			TKHD_MATRIX_V0
		};
	if at + MATRIX_LEN > tkhd.body.end {
		return Ok(false);
	}
	let mut matrix = [0u8; MATRIX_LEN as usize];
	read_at(reader, at, &mut matrix)?;
	let horizontal = u32_at(&matrix, 0) == 0 && u32_at(&matrix, 16) == 0;
	Ok(horizontal && u32_at(&matrix, 4) != 0 && u32_at(&matrix, 12) != 0)
}

fn is_visual_handler<R: Read + Seek>(
	reader: &mut R,
	mdia: Span,
) -> io::Result<bool> {
	let Some(hdlr) = find(reader, mdia, b"hdlr")? else {
		return Ok(false);
	};
	if hdlr.body.size() < 12 {
		return Ok(false);
	}
	let mut handler = [0u8; 4];
	read_at(reader, hdlr.body.start + 8, &mut handler)?;
	Ok(&handler == b"vide")
}

fn u16_at(bytes: &[u8], at: usize) -> u16 {
	u16::from_be_bytes(bytes[at..at + 2].try_into().expect("two bytes"))
}

fn u32_at(bytes: &[u8], at: usize) -> u32 {
	u32::from_be_bytes(bytes[at..at + 4].try_into().expect("four bytes"))
}

fn u64_at(bytes: &[u8], at: usize) -> u64 {
	u64::from_be_bytes(bytes[at..at + 8].try_into().expect("eight bytes"))
}

#[cfg(test)]
mod tests {
	use std::io::Cursor;

	use super::*;

	const FASTSTART: &[u8] = include_bytes!("fixtures/faststart.mp4");
	const MOOV_LAST: &[u8] = include_bytes!("fixtures/moovlast.mp4");
	const QUICKTIME: &[u8] = include_bytes!("fixtures/quicktime.mov");
	const ROTATED: &[u8] = include_bytes!("fixtures/rotated.mp4");
	const ANAMORPHIC: &[u8] = include_bytes!("fixtures/anamorphic.mp4");

	fn probed(bytes: &[u8]) -> Option<Probe> {
		probe(&mut Cursor::new(bytes)).expect("probe")
	}

	#[test]
	fn reads_a_clip_whose_moov_comes_first() {
		assert_eq!(
			probed(FASTSTART),
			Some(Probe {
				width: 16,
				height: 16,
				duration_ms: 1000
			})
		);
	}

	#[test]
	fn reads_a_clip_whose_moov_comes_after_the_media() {
		assert_eq!(
			probed(MOOV_LAST),
			Some(Probe {
				width: 16,
				height: 16,
				duration_ms: 1000
			})
		);
	}

	#[test]
	fn reads_a_quicktime_clip() {
		assert_eq!(
			probed(QUICKTIME),
			Some(Probe {
				width: 32,
				height: 24,
				duration_ms: 1000
			})
		);
	}

	#[test]
	fn a_quarter_turn_display_matrix_swaps_the_coded_size() {
		assert_eq!(
			probed(ROTATED),
			Some(Probe {
				width: 32,
				height: 16,
				duration_ms: 1000
			})
		);
	}

	#[test]
	fn the_sample_entry_wins_when_the_track_header_disagrees() {
		assert_eq!(
			probed(ANAMORPHIC),
			Some(Probe {
				width: 32,
				height: 16,
				duration_ms: 1000
			})
		);
	}

	#[test]
	fn reads_only_the_headers_it_needs() {
		let mut reader = CountingReader {
			inner: Cursor::new(MOOV_LAST),
			read: 0,
		};

		let found = probe(&mut reader).expect("probe");

		assert!(found.is_some());
		assert!(
			reader.read < MOOV_LAST.len() as u64,
			"read {} of {} bytes",
			reader.read,
			MOOV_LAST.len()
		);
	}

	#[test]
	fn a_file_without_a_movie_box_probes_to_nothing() {
		let mut bytes = 16u32.to_be_bytes().to_vec();
		bytes.extend_from_slice(b"ftypmp42");
		bytes.extend_from_slice(b"\0\0\0\0");

		assert_eq!(probed(&bytes), None);
	}

	#[test]
	fn an_empty_file_probes_to_nothing() {
		assert_eq!(probed(b""), None);
	}

	#[test]
	fn a_truncated_movie_box_probes_to_nothing() {
		let head = &FASTSTART[..FASTSTART.len() / 4];

		assert_eq!(probed(head), None);
	}

	struct CountingReader {
		inner: Cursor<&'static [u8]>,
		read: u64,
	}

	impl Read for CountingReader {
		fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
			let read = self.inner.read(buf)?;
			self.read += read as u64;
			Ok(read)
		}
	}

	impl Seek for CountingReader {
		fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
			self.inner.seek(to)
		}
	}
}
