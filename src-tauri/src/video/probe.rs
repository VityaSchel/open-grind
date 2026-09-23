use std::io::{self, Read, Seek, SeekFrom};

use crate::video::boxes::{
	be_u16, be_u32, be_u64, children, find, find_path, handler_type, read_at,
	Located, Span,
};

const SAMPLE_ENTRY_DIMENSIONS: u64 = 24;
const TKHD_MATRIX_V0: u64 = 40;
const TKHD_MATRIX_V1: u64 = 52;
const MATRIX_LEN: u64 = 36;
const MVHD_TIMESCALE_V0: usize = 12;
const MVHD_DURATION_V0: usize = 16;
const MVHD_TIMESCALE_V1: usize = 20;
const MVHD_DURATION_V1: usize = 24;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Probe {
	pub width: u32,
	pub height: u32,
	pub duration_ms: Option<u64>,
}

pub fn probe<R: Read + Seek>(reader: &mut R) -> io::Result<Option<Probe>> {
	let end = reader.seek(SeekFrom::End(0))?;
	let Some(moov) = find(reader, Span { start: 0, end }, b"moov")? else {
		return Ok(None);
	};
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
			duration_ms: duration_ms(reader, moov)?,
		}));
	}
	Ok(None)
}

fn duration_ms<R: Read + Seek>(
	reader: &mut R,
	moov: Located,
) -> io::Result<Option<u64>> {
	let Some(mvhd) = find(reader, moov.body, b"mvhd")? else {
		return Ok(None);
	};
	let mut header = [0u8; MVHD_DURATION_V1 + 8];
	let readable = mvhd.body.size().min(header.len() as u64) as usize;
	read_at(reader, mvhd.body.start, &mut header[..readable])?;
	let header = &header[..readable];
	let (timescale, duration) = if header.first() == Some(&1) {
		(
			be_u32(header, MVHD_TIMESCALE_V1),
			be_u64(header, MVHD_DURATION_V1),
		)
	} else {
		(
			be_u32(header, MVHD_TIMESCALE_V0),
			be_u32(header, MVHD_DURATION_V0).map(u64::from),
		)
	};
	let (Some(timescale), Some(duration)) = (timescale, duration) else {
		return Ok(None);
	};
	if timescale == 0
		|| duration == 0
		|| duration == u64::MAX
		|| duration == u64::from(u32::MAX)
	{
		return Ok(None);
	}
	let milliseconds = u128::from(duration) * 1000 / u128::from(timescale);
	Ok(u64::try_from(milliseconds).ok())
}

fn visual_size<R: Read + Seek>(
	reader: &mut R,
	trak: Located,
) -> io::Result<Option<(u32, u32)>> {
	let Some(mdia) = find(reader, trak.body, b"mdia")? else {
		return Ok(None);
	};
	if handler_type(reader, mdia.body)? != Some(*b"vide") {
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
	let (Some(width), Some(height)) =
		(be_u16(&dimensions, 0), be_u16(&dimensions, 2))
	else {
		return Ok(None);
	};
	let (width, height) = (u32::from(width), u32::from(height));
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
	let cell = |at: usize| be_u32(&matrix, at).unwrap_or_default();
	let horizontal = cell(0) == 0 && cell(16) == 0;
	Ok(horizontal && cell(4) != 0 && cell(12) != 0)
}

#[cfg(test)]
mod tests {
	use std::io::Cursor;

	use super::*;
	use crate::video::test_support::CountingReader;

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
				duration_ms: Some(1000),
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
				duration_ms: Some(1000),
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
				duration_ms: Some(1000),
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
				duration_ms: Some(1000),
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
				duration_ms: Some(1000),
			})
		);
	}

	#[test]
	fn reads_only_the_headers_it_needs() {
		let mut reader = CountingReader::new(MOOV_LAST);

		let found = probe(&mut reader).expect("probe");

		assert!(found.is_some());
		assert!(
			reader.bytes_read < MOOV_LAST.len() as u64,
			"read {} of {} bytes",
			reader.bytes_read,
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

	fn movie_duration(mvhd: &[u8]) -> Option<u64> {
		let mut mvhd_box = ((mvhd.len() + 8) as u32).to_be_bytes().to_vec();
		mvhd_box.extend_from_slice(b"mvhd");
		mvhd_box.extend_from_slice(mvhd);
		let mut movie = ((mvhd_box.len() + 8) as u32).to_be_bytes().to_vec();
		movie.extend_from_slice(b"moov");
		movie.extend_from_slice(&mvhd_box);
		let mut reader = Cursor::new(movie.clone());
		let moov = find(
			&mut reader,
			Span {
				start: 0,
				end: movie.len() as u64,
			},
			b"moov",
		)
		.expect("find")
		.expect("moov");
		duration_ms(&mut reader, moov).expect("duration")
	}

	fn version_0_header(timescale: u32, duration: u32) -> Vec<u8> {
		let mut header = vec![0u8; 12];
		header.extend_from_slice(&timescale.to_be_bytes());
		header.extend_from_slice(&duration.to_be_bytes());
		header
	}

	#[test]
	fn reads_a_version_1_movie_duration() {
		let mut header = vec![1u8, 0, 0, 0];
		header.extend_from_slice(&[0u8; 16]);
		header.extend_from_slice(&600u32.to_be_bytes());
		header.extend_from_slice(&9_000u64.to_be_bytes());

		assert_eq!(movie_duration(&header), Some(15_000));
	}

	#[test]
	fn converts_a_version_0_duration_from_its_timescale() {
		assert_eq!(
			movie_duration(&version_0_header(90_000, 45_000)),
			Some(500)
		);
	}

	#[test]
	fn an_unknown_or_unscaled_duration_is_left_out() {
		assert_eq!(movie_duration(&version_0_header(0, 1_000)), None);
		assert_eq!(movie_duration(&version_0_header(1_000, 0)), None);
		assert_eq!(movie_duration(&version_0_header(1_000, u32::MAX)), None);
		assert_eq!(movie_duration(&[0u8; 10]), None);
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
}
