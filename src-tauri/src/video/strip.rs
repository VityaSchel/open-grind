use std::io::{self, Read, Seek, SeekFrom};
use std::ops::Range;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::video::boxes::{
	be_u32, be_u64, children, find, find_path, handler_type, header, read_at,
	Located, Span,
};

const MOVIE_EPOCH_OFFSET: u64 = 2_082_844_800;
const MAX_TABLE_BYTES: u64 = 8 * 1024 * 1024;
const FREE: &[u8; 4] = b"free";
const STSZ: Layout = Layout {
	count_at: 8,
	stride: 4,
};
const STCO: Layout = Layout {
	count_at: 4,
	stride: 4,
};
const CO64: Layout = Layout {
	count_at: 4,
	stride: 8,
};
const STSC: Layout = Layout {
	count_at: 4,
	stride: 12,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Fill {
	Zeros,
	Bytes(Vec<u8>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Patch {
	pub span: Span,
	pub fill: Fill,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Level {
	Moov,
	Trak,
	Mdia,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Action {
	Keep,
	Blank,
	Free,
	Times,
	Descend(Level),
	Track,
}

pub fn movie_time(at: SystemTime) -> u64 {
	at.duration_since(UNIX_EPOCH)
		.map(|since| since.as_secs())
		.unwrap_or_default()
		.saturating_add(MOVIE_EPOCH_OFFSET)
}

pub fn plan<R: Read + Seek>(
	reader: &mut R,
	uploaded_at: u64,
) -> io::Result<Option<Vec<Patch>>> {
	let end = reader.seek(SeekFrom::End(0))?;
	let mut planner = Planner {
		reader,
		uploaded_at,
		file_size: end,
		patches: Vec::new(),
		unstrippable: false,
	};
	let mut at = 0;
	let mut movie = false;
	while at < end {
		let span = Span { start: at, end };
		let Some(child) = header(planner.reader, span)? else {
			if !movie {
				return Ok(None);
			}
			planner.free_span(span);
			break;
		};
		match top_action(&child.box_type) {
			Action::Descend(level) => {
				movie = true;
				planner.walk(child.body, level)?;
			}
			Action::Blank => planner.zero(child.body),
			Action::Free => planner.free(child),
			_ => {}
		}
		at = child.body.end;
	}
	if !movie || planner.unstrippable {
		return Ok(None);
	}
	Ok(Some(planner.finish()))
}

fn top_action(box_type: &[u8; 4]) -> Action {
	match box_type {
		b"moov" => Action::Descend(Level::Moov),
		b"ftyp" | b"mdat" | b"moof" | b"mfra" | b"sidx" | b"styp" | b"ssix" => {
			Action::Keep
		}
		b"free" | b"skip" | b"wide" => Action::Blank,
		_ => Action::Free,
	}
}

fn action(level: Level, box_type: &[u8; 4]) -> Action {
	match level {
		Level::Moov => match box_type {
			b"mvhd" => Action::Times,
			b"trak" => Action::Track,
			b"mvex" | b"iods" | b"pssh" => Action::Keep,
			_ => Action::Free,
		},
		Level::Trak => match box_type {
			b"tkhd" => Action::Times,
			b"mdia" => Action::Descend(Level::Mdia),
			b"edts" | b"tref" | b"tapt" | b"load" | b"txas" | b"clip"
			| b"matt" | b"imap" => Action::Keep,
			_ => Action::Free,
		},
		Level::Mdia => match box_type {
			b"mdhd" => Action::Times,
			b"hdlr" | b"minf" | b"elng" => Action::Keep,
			_ => Action::Free,
		},
	}
}

struct Planner<'a, R> {
	reader: &'a mut R,
	uploaded_at: u64,
	file_size: u64,
	patches: Vec<Patch>,
	unstrippable: bool,
}

impl<R: Read + Seek> Planner<'_, R> {
	fn finish(mut self) -> Vec<Patch> {
		self.patches.sort_by_key(|patch| patch.span.start);
		self.patches
	}

	fn zero(&mut self, span: Span) {
		if span.size() > 0 {
			self.patches.push(Patch {
				span,
				fill: Fill::Zeros,
			});
		}
	}

	fn write(&mut self, at: u64, bytes: Vec<u8>) {
		self.patches.push(Patch {
			span: Span {
				start: at,
				end: at + bytes.len() as u64,
			},
			fill: Fill::Bytes(bytes),
		});
	}

	fn free(&mut self, located: Located) {
		self.write(located.start + 4, FREE.to_vec());
		self.zero(Span {
			start: located.payload_start(),
			end: located.body.end,
		});
	}

	fn free_span(&mut self, span: Span) {
		let size = span.size();
		if size < 8 {
			self.zero(span);
			return;
		}
		let declared = u32::try_from(size).unwrap_or_default();
		let mut head = declared.to_be_bytes().to_vec();
		head.extend_from_slice(FREE);
		self.write(span.start, head);
		self.zero(Span {
			start: span.start + 8,
			end: span.end,
		});
	}

	fn walk(&mut self, within: Span, level: Level) -> io::Result<()> {
		let mut at = within.start;
		while at < within.end {
			let Some(child) = header(
				self.reader,
				Span {
					start: at,
					end: within.end,
				},
			)?
			else {
				self.free_span(Span {
					start: at,
					end: within.end,
				});
				return Ok(());
			};
			match action(level, &child.box_type) {
				Action::Times => self.times(child)?,
				Action::Descend(inner) => self.walk(child.body, inner)?,
				Action::Track => self.track(child)?,
				Action::Free => self.free(child),
				Action::Blank => self.zero(child.body),
				Action::Keep => {}
			}
			at = child.body.end;
		}
		Ok(())
	}

	fn times(&mut self, located: Located) -> io::Result<()> {
		let mut version = [0u8; 1];
		read_at(self.reader, located.body.start, &mut version)?;
		let wide = version[0] == 1;
		let field = if wide { 8 } else { 4 };
		let at = located.body.start + 4;
		if at + 2 * field > located.body.end {
			return Ok(());
		}
		let stamp = if wide {
			self.uploaded_at.to_be_bytes().to_vec()
		} else {
			u32::try_from(self.uploaded_at)
				.unwrap_or(u32::MAX)
				.to_be_bytes()
				.to_vec()
		};
		self.write(at, stamp.repeat(2));
		Ok(())
	}

	fn track(&mut self, trak: Located) -> io::Result<()> {
		if self.is_media(trak.body)? {
			return self.walk(trak.body, Level::Trak);
		}
		let Some(ranges) = self.sample_ranges(trak.body)? else {
			self.unstrippable = true;
			return Ok(());
		};
		for span in ranges {
			self.zero(span);
		}
		self.free(trak);
		Ok(())
	}

	fn is_media(&mut self, trak: Span) -> io::Result<bool> {
		let Some(mdia) = find(self.reader, trak, b"mdia")? else {
			return Ok(false);
		};
		let handler = handler_type(self.reader, mdia.body)?;
		Ok(matches!(handler.as_ref(), Some(b"vide" | b"soun")))
	}

	fn sample_ranges(&mut self, trak: Span) -> io::Result<Option<Vec<Span>>> {
		let Some(stbl) =
			find_path(self.reader, trak, &[*b"mdia", *b"minf", *b"stbl"])?
		else {
			return Ok(Some(Vec::new()));
		};
		let tables = children(self.reader, stbl.body)?;
		let Some(sample_tables) = self.sample_tables(&tables)? else {
			return Ok(None);
		};
		Ok(sample_tables.chunk_spans(self.file_size))
	}

	fn sample_tables(
		&mut self,
		tables: &[Located],
	) -> io::Result<Option<SampleTables>> {
		let Some(sizes) = self.sample_sizes(tables)? else {
			return Ok(None);
		};
		let Some(chunk_offsets) = self.chunk_offsets(tables)? else {
			return Ok(None);
		};
		let Some(runs) = self.entries(tables, b"stsc", STSC)? else {
			return Ok(None);
		};
		Ok(Some(SampleTables {
			sizes,
			chunk_offsets,
			runs,
		}))
	}

	fn sample_sizes(
		&mut self,
		tables: &[Located],
	) -> io::Result<Option<SampleSizes>> {
		let Some(stsz) = self.table(tables, b"stsz")? else {
			return Ok(None);
		};
		let (Some(fixed), Some(count)) = (be_u32(&stsz, 4), be_u32(&stsz, 8))
		else {
			return Ok(None);
		};
		if fixed == 0 {
			return Ok(Entries::new(stsz, STSZ).map(SampleSizes::Listed));
		}
		let (size, count) = (u64::from(fixed), u64::from(count));
		if count.saturating_mul(size) > self.file_size {
			return Ok(None);
		}
		Ok(Some(SampleSizes::Fixed { size, count }))
	}

	fn chunk_offsets(
		&mut self,
		tables: &[Located],
	) -> io::Result<Option<Entries>> {
		if let Some(co64) = self.table(tables, b"co64")? {
			return Ok(Entries::new(co64, CO64));
		}
		self.entries(tables, b"stco", STCO)
	}

	fn entries(
		&mut self,
		tables: &[Located],
		box_type: &[u8; 4],
		layout: Layout,
	) -> io::Result<Option<Entries>> {
		Ok(self
			.table(tables, box_type)?
			.and_then(|bytes| Entries::new(bytes, layout)))
	}

	fn table(
		&mut self,
		tables: &[Located],
		box_type: &[u8; 4],
	) -> io::Result<Option<Vec<u8>>> {
		let Some(found) = tables.iter().find(|table| table.is(box_type)) else {
			return Ok(None);
		};
		let size = found.body.size();
		if !(8..=MAX_TABLE_BYTES).contains(&size) {
			return Ok(None);
		}
		let mut bytes = vec![0u8; size as usize];
		read_at(self.reader, found.body.start, &mut bytes)?;
		Ok(Some(bytes))
	}
}

#[derive(Debug, Clone, Copy)]
struct Layout {
	count_at: usize,
	stride: usize,
}

struct Entries {
	bytes: Vec<u8>,
	start: usize,
	stride: usize,
	count: usize,
}

impl Entries {
	fn new(bytes: Vec<u8>, layout: Layout) -> Option<Self> {
		let count = be_u32(&bytes, layout.count_at)? as usize;
		let start = layout.count_at + 4;
		let room = bytes.len().checked_sub(start)? / layout.stride;
		(count <= room).then_some(Self {
			bytes,
			start,
			stride: layout.stride,
			count,
		})
	}

	fn entry(&self, index: usize) -> Option<&[u8]> {
		if index >= self.count {
			return None;
		}
		let at = self.start + index * self.stride;
		self.bytes.get(at..at + self.stride)
	}
}

enum SampleSizes {
	Fixed { size: u64, count: u64 },
	Listed(Entries),
}

impl SampleSizes {
	fn count(&self) -> u64 {
		match self {
			Self::Fixed { count, .. } => *count,
			Self::Listed(entries) => entries.count as u64,
		}
	}

	fn total(&self, samples: Range<u64>) -> Option<u64> {
		match self {
			Self::Fixed { size, .. } => Some(
				size.saturating_mul(samples.end.saturating_sub(samples.start)),
			),
			Self::Listed(entries) => samples
				.map(|index| {
					let entry = entries.entry(usize::try_from(index).ok()?)?;
					be_u32(entry, 0).map(u64::from)
				})
				.sum(),
		}
	}
}

struct SampleTables {
	sizes: SampleSizes,
	chunk_offsets: Entries,
	runs: Entries,
}

impl SampleTables {
	fn chunk_spans(&self, file_size: u64) -> Option<Vec<Span>> {
		let mut spans = Vec::new();
		let mut sample = 0u64;
		let mut per_chunk = 0u64;
		let mut run = 0usize;
		for index in 0..self.chunk_offsets.count {
			while let Some(next) = self.runs.entry(run) {
				if be_u32(next, 0)? as usize > index + 1 {
					break;
				}
				per_chunk = u64::from(be_u32(next, 4)?);
				run += 1;
			}
			let next_sample =
				sample.saturating_add(per_chunk).min(self.sizes.count());
			let total = self.sizes.total(sample..next_sample)?;
			sample = next_sample;
			let start = self.chunk_offset(index)?;
			let end = start.saturating_add(total);
			if end > file_size {
				return None;
			}
			if total > 0 {
				spans.push(Span { start, end });
			}
		}
		Some(coalesced(spans))
	}

	fn chunk_offset(&self, index: usize) -> Option<u64> {
		let entry = self.chunk_offsets.entry(index)?;
		if self.chunk_offsets.stride == CO64.stride {
			return be_u64(entry, 0);
		}
		be_u32(entry, 0).map(u64::from)
	}
}

fn coalesced(mut spans: Vec<Span>) -> Vec<Span> {
	spans.sort_unstable_by_key(|span| span.start);
	spans.dedup_by(|next, kept| {
		if next.start > kept.end {
			return false;
		}
		kept.end = kept.end.max(next.end);
		true
	});
	spans
}

pub struct PatchedReader<R> {
	inner: R,
	patches: Arc<[Patch]>,
	at: u64,
	next: usize,
}

impl<R: Read> PatchedReader<R> {
	pub fn new(inner: R, patches: Arc<[Patch]>) -> Self {
		Self {
			inner,
			patches,
			at: 0,
			next: 0,
		}
	}
}

impl<R: Read> Read for PatchedReader<R> {
	fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
		let read = self.inner.read(buf)?;
		if read == 0 {
			return Ok(0);
		}
		let start = self.at;
		let end = start + read as u64;
		while self
			.patches
			.get(self.next)
			.is_some_and(|patch| patch.span.end <= start)
		{
			self.next += 1;
		}
		for patch in &self.patches[self.next..] {
			if patch.span.start >= end {
				break;
			}
			if patch.span.end <= start {
				continue;
			}
			let from = patch.span.start.max(start);
			let upto = patch.span.end.min(end);
			let range = (from - start) as usize..(upto - start) as usize;
			match &patch.fill {
				Fill::Zeros => buf[range].fill(0),
				Fill::Bytes(bytes) => {
					let taken = (from - patch.span.start) as usize;
					let len = range.len();
					buf[range].copy_from_slice(&bytes[taken..taken + len]);
				}
			}
		}
		self.at = end;
		Ok(read)
	}
}

#[cfg(test)]
mod tests {
	use std::io::Cursor;

	use super::*;
	use crate::video::probe::probe;
	use crate::video::test_support::{boxed, whole};

	const METADATA: &[u8] = include_bytes!("fixtures/metadata.mp4");
	const PLANTED: [&[u8]; 6] = [
		b"PlantedMak",
		b"PlantedMake",
		b"PlantedModel",
		b"PlantedSoftware",
		b"+37.7752-122.4197/",
		b"xmpmeta",
	];
	const UPLOADED_AT: u64 = 3_900_000_000;

	fn planned(bytes: &[u8], uploaded_at: u64) -> Vec<Patch> {
		plan(&mut Cursor::new(bytes), uploaded_at)
			.expect("plan")
			.expect("planned")
	}

	fn patched(bytes: &[u8], uploaded_at: u64) -> Vec<u8> {
		applied(bytes, &planned(bytes, uploaded_at))
	}

	fn applied(bytes: &[u8], patches: &[Patch]) -> Vec<u8> {
		let mut reader = PatchedReader::new(
			Cursor::new(bytes.to_vec()),
			Arc::from(patches.to_vec()),
		);
		let mut out = Vec::new();
		reader.read_to_end(&mut out).expect("read");
		out
	}

	fn handlers(bytes: &[u8]) -> Vec<[u8; 4]> {
		let mut reader = Cursor::new(bytes);
		let moov = find(&mut reader, whole(bytes), b"moov")
			.expect("walk")
			.expect("moov");
		children(&mut reader, moov.body)
			.expect("children")
			.into_iter()
			.filter(|child| child.is(b"trak"))
			.filter_map(|trak| {
				let mdia =
					find(&mut reader, trak.body, b"mdia").expect("walk")?;
				handler_type(&mut reader, mdia.body).expect("read")
			})
			.collect()
	}

	fn field(bytes: &[u8], path: &[[u8; 4]], at: u64) -> u32 {
		let mut reader = Cursor::new(bytes);
		let found = find_path(&mut reader, whole(bytes), path)
			.expect("walk")
			.expect("box");
		let mut word = [0u8; 4];
		read_at(&mut reader, found.body.start + at, &mut word).expect("read");
		u32::from_be_bytes(word)
	}

	#[test]
	fn a_recorded_clip_loses_every_planted_identifier() {
		let out = patched(METADATA, UPLOADED_AT);

		for planted in PLANTED {
			assert!(
				!out.windows(planted.len()).any(|window| window == planted),
				"{} survived",
				String::from_utf8_lossy(planted)
			);
		}
	}

	#[test]
	fn the_patched_clip_keeps_its_size_dimensions_and_media_tracks() {
		let out = patched(METADATA, UPLOADED_AT);

		assert_eq!(out.len(), METADATA.len());
		assert_eq!(
			probe(&mut Cursor::new(&out)).expect("probe"),
			probe(&mut Cursor::new(METADATA)).expect("probe")
		);
		assert_eq!(handlers(METADATA), [*b"vide", *b"soun", *b"sbtl"]);
		assert_eq!(handlers(&out), [*b"vide", *b"soun"]);
	}

	#[test]
	fn the_movie_track_and_media_headers_carry_the_upload_time() {
		let out = patched(METADATA, UPLOADED_AT);

		for path in [
			vec![*b"moov", *b"mvhd"],
			vec![*b"moov", *b"trak", *b"tkhd"],
			vec![*b"moov", *b"trak", *b"mdia", *b"mdhd"],
		] {
			assert_eq!(field(&out, &path, 4), UPLOADED_AT as u32, "{path:?}");
			assert_eq!(field(&out, &path, 8), UPLOADED_AT as u32, "{path:?}");
		}
		assert_eq!(
			field(&out, &[*b"moov", *b"mvhd"], 12),
			field(METADATA, &[*b"moov", *b"mvhd"], 12)
		);
		assert_eq!(
			field(&out, &[*b"moov", *b"mvhd"], 16),
			field(METADATA, &[*b"moov", *b"mvhd"], 16)
		);
	}

	#[test]
	fn a_version_one_header_gets_a_sixty_four_bit_time() {
		let mut mvhd = vec![1u8, 0, 0, 0];
		mvhd.extend_from_slice(&[0xffu8; 28]);
		let bytes = boxed(b"moov", &boxed(b"mvhd", &mvhd));

		let out = patched(&bytes, UPLOADED_AT);

		let payload = &out[16..];
		assert_eq!(&payload[4..12], &UPLOADED_AT.to_be_bytes());
		assert_eq!(&payload[12..20], &UPLOADED_AT.to_be_bytes());
		assert_eq!(&payload[20..], &[0xffu8; 12]);
	}

	#[test]
	fn a_movie_level_metadata_box_is_freed_without_being_walked() {
		let meta = boxed(b"meta", b"\0\0\0\0secrets");
		let bytes = boxed(b"moov", &meta);

		let out = patched(&bytes, UPLOADED_AT);

		assert_eq!(&out[8..12], &(meta.len() as u32).to_be_bytes());
		assert_eq!(&out[12..16], b"free");
		assert!(out[16..].iter().all(|byte| *byte == 0));
	}

	#[test]
	fn a_text_track_is_freed_and_its_samples_are_zeroed() {
		let bytes = movie_with_text_track();

		let out = patched(&bytes, UPLOADED_AT);

		assert_eq!(handlers(&out), [] as [[u8; 4]; 0]);
		let mdat = out.len() - 16;
		assert_eq!(&out[mdat..mdat + 8], &bytes[mdat..mdat + 8]);
		assert_eq!(&out[mdat + 8..], &[0u8; 8]);
	}

	#[test]
	fn a_track_without_sample_tables_is_still_freed() {
		let mdia = boxed(b"mdia", &hdlr(b"text"));
		let bytes = boxed(b"moov", &boxed(b"trak", &mdia));

		let out = patched(&bytes, UPLOADED_AT);

		assert_eq!(handlers(&out), [] as [[u8; 4]; 0]);
		assert_eq!(&out[12..16], b"free");
		assert!(out[16..].iter().all(|byte| *byte == 0));
	}

	#[test]
	fn a_raw_trailer_after_the_movie_becomes_one_free_box() {
		let mut bytes = boxed(b"moov", &boxed(b"mvhd", &[0u8; 20]));
		let trailer = bytes.len();
		bytes.extend_from_slice(b"raw samsung trailer bytes");

		let out = patched(&bytes, UPLOADED_AT);

		assert_eq!(out.len(), bytes.len());
		assert_eq!(
			&out[trailer..trailer + 4],
			&((bytes.len() - trailer) as u32).to_be_bytes()
		);
		assert_eq!(&out[trailer + 4..trailer + 8], b"free");
		assert!(out[trailer + 8..].iter().all(|byte| *byte == 0));
	}

	#[test]
	fn a_file_without_a_movie_box_is_refused() {
		let bytes = boxed(b"ftyp", b"mp42");

		assert!(plan(&mut Cursor::new(&bytes), UPLOADED_AT)
			.expect("plan")
			.is_none());
	}

	#[test]
	fn a_broken_box_before_the_movie_is_refused() {
		let mut bytes = 4u32.to_be_bytes().to_vec();
		bytes.extend_from_slice(b"junk");
		bytes.extend(boxed(b"moov", b""));

		assert!(plan(&mut Cursor::new(&bytes), UPLOADED_AT)
			.expect("plan")
			.is_none());
	}

	#[test]
	fn hostile_sizes_are_refused_without_panicking() {
		let mut largesize = 1u32.to_be_bytes().to_vec();
		largesize.extend_from_slice(b"moov");
		largesize.extend_from_slice(&u64::MAX.to_be_bytes());
		let mut endless = 0u32.to_be_bytes().to_vec();
		endless.extend_from_slice(b"uuid");
		endless.extend_from_slice(b"tail");

		assert!(plan(&mut Cursor::new(&largesize), UPLOADED_AT)
			.expect("plan")
			.is_none());
		assert!(plan(&mut Cursor::new(&endless), UPLOADED_AT)
			.expect("plan")
			.is_none());
	}

	#[test]
	fn every_chunk_zeroes_the_samples_its_run_declares() {
		let mut stbl = boxed(b"stsz", &table(&[0, 3, 2, 3, 3]));
		stbl.extend(boxed(b"stsc", &table(&[2, 1, 1, 1, 2, 2, 1])));
		stbl.extend(boxed(b"stco", &table(&[2, 0, 0])));
		let mut mdia = hdlr(b"text");
		mdia.extend(boxed(b"minf", &boxed(b"stbl", &stbl)));
		let mut movie = boxed(b"moov", &boxed(b"trak", &boxed(b"mdia", &mdia)));
		let samples = movie.len() as u32 + 8;
		let chunk = movie
			.windows(4)
			.position(|window| window == b"stco")
			.expect("stco")
			+ 12;
		movie[chunk..chunk + 4].copy_from_slice(&samples.to_be_bytes());
		movie[chunk + 4..chunk + 8]
			.copy_from_slice(&(samples + 2).to_be_bytes());
		movie.extend(boxed(b"mdat", b"AABBBCCC"));

		let out = patched(&movie, UPLOADED_AT);

		assert_eq!(&out[samples as usize..], &[0u8; 8]);
	}

	#[test]
	fn sample_offsets_past_the_end_refuse_the_strip() {
		let bytes = movie_with_text_track();
		let mut broken = bytes.clone();
		let stco = bytes
			.windows(4)
			.position(|window| window == b"stco")
			.expect("stco");
		broken[stco + 12..stco + 16].copy_from_slice(&u32::MAX.to_be_bytes());

		assert!(plan(&mut Cursor::new(&broken), UPLOADED_AT)
			.expect("plan")
			.is_none());
	}

	#[test]
	fn the_patched_reader_matches_whole_buffer_patching() {
		let patches = planned(METADATA, UPLOADED_AT);
		let whole = applied(METADATA, &patches);

		for size in [1usize, 7, 4096, 1024 * 1024] {
			let mut reader = PatchedReader::new(
				Cursor::new(METADATA.to_vec()),
				Arc::from(patches.clone()),
			);
			let mut out = Vec::new();
			let mut chunk = vec![0u8; size];
			loop {
				let read = reader.read(&mut chunk).expect("read");
				if read == 0 {
					break;
				}
				out.extend_from_slice(&chunk[..read]);
			}
			assert_eq!(out, whole, "read size {size}");
		}
	}

	#[test]
	fn a_sample_count_larger_than_the_file_refuses_the_strip() {
		let mut stsz = vec![0u8; 4];
		stsz.extend_from_slice(&1u32.to_be_bytes());
		stsz.extend_from_slice(&u32::MAX.to_be_bytes());
		let mut stbl = boxed(b"stsz", &stsz);
		stbl.extend(boxed(b"stsc", &table(&[1, 1, 1, 1])));
		stbl.extend(boxed(b"stco", &table(&[1, 0])));
		let mut mdia = hdlr(b"text");
		mdia.extend(boxed(b"minf", &boxed(b"stbl", &stbl)));
		let bytes = boxed(b"moov", &boxed(b"trak", &boxed(b"mdia", &mdia)));

		assert!(plan(&mut Cursor::new(&bytes), UPLOADED_AT)
			.expect("plan")
			.is_none());
	}

	#[test]
	fn a_huge_fixed_size_sample_table_is_zeroed_without_expanding_it() {
		const SAMPLES: u32 = 3_000_000_000;
		const CHUNKS: u32 = 1_000;
		let per_chunk = SAMPLES / CHUNKS;
		let movie = |offsets: &[u32]| {
			let mut stsz = vec![0u8; 4];
			stsz.extend_from_slice(&1u32.to_be_bytes());
			stsz.extend_from_slice(&SAMPLES.to_be_bytes());
			let mut stbl = boxed(b"stsz", &stsz);
			stbl.extend(boxed(b"stsc", &table(&[1, 1, per_chunk, 1])));
			let mut stco = vec![CHUNKS];
			stco.extend_from_slice(offsets);
			stbl.extend(boxed(b"stco", &table(&stco)));
			let mut mdia = hdlr(b"meta");
			mdia.extend(boxed(b"minf", &boxed(b"stbl", &stbl)));
			boxed(b"moov", &boxed(b"trak", &boxed(b"mdia", &mdia)))
		};
		let samples_at = movie(&[0; CHUNKS as usize]).len() as u64 + 16;
		let offsets = (0..CHUNKS)
			.map(|chunk| samples_at as u32 + chunk * per_chunk)
			.collect::<Vec<_>>();
		let mut head = movie(&offsets);
		head.extend_from_slice(&1u32.to_be_bytes());
		head.extend_from_slice(b"mdat");
		head.extend_from_slice(&(16 + u64::from(SAMPLES)).to_be_bytes());
		let file_size = samples_at + u64::from(SAMPLES);
		let mut reader = SparseFile {
			head,
			len: file_size,
			at: 0,
		};

		let patches = plan(&mut reader, UPLOADED_AT)
			.expect("plan")
			.expect("planned");

		assert_eq!(patches.len(), 3, "{patches:?}");
		assert_eq!(
			patches.last(),
			Some(&Patch {
				span: Span {
					start: samples_at,
					end: file_size,
				},
				fill: Fill::Zeros,
			})
		);
	}

	#[test]
	fn a_malformed_child_frees_the_rest_of_its_container() {
		let mut moov = boxed(b"mvhd", &[0u8; 20]);
		moov.extend_from_slice(&4096u32.to_be_bytes());
		moov.extend_from_slice(b"junk");
		moov.extend_from_slice(&[0u8; 8]);
		moov.extend(boxed(b"udta", b"PlantedSoftware +37.7752-122.4197/"));
		let bytes = boxed(b"moov", &moov);

		let out = patched(&bytes, UPLOADED_AT);

		assert_eq!(out.len(), bytes.len());
		for planted in [b"PlantedSoftware".as_slice(), b"+37.7752".as_slice()] {
			assert!(
				!out.windows(planted.len()).any(|window| window == planted),
				"{} survived",
				String::from_utf8_lossy(planted)
			);
		}
	}

	#[test]
	fn overlapping_patches_are_applied_without_panicking() {
		let patches = vec![
			Patch {
				span: Span { start: 0, end: 40 },
				fill: Fill::Zeros,
			},
			Patch {
				span: Span { start: 4, end: 8 },
				fill: Fill::Bytes(FREE.to_vec()),
			},
		];
		let mut reader =
			PatchedReader::new(Cursor::new(vec![7u8; 48]), Arc::from(patches));

		let mut out = Vec::new();
		let mut chunk = [0u8; 8];
		loop {
			let read = reader.read(&mut chunk).expect("read");
			if read == 0 {
				break;
			}
			out.extend_from_slice(&chunk[..read]);
		}

		assert_eq!(&out[4..8], FREE);
		assert!(out[8..40].iter().all(|byte| *byte == 0));
		assert_eq!(&out[40..], &[7u8; 8]);
	}

	#[test]
	fn the_movie_time_of_the_unix_epoch_is_the_offset() {
		assert_eq!(movie_time(UNIX_EPOCH), MOVIE_EPOCH_OFFSET);
	}

	fn hdlr(handler: &[u8; 4]) -> Vec<u8> {
		let mut body = vec![0u8; 8];
		body.extend_from_slice(handler);
		body.extend_from_slice(&[0u8; 12]);
		boxed(b"hdlr", &body)
	}

	fn table(words: &[u32]) -> Vec<u8> {
		let mut bytes = vec![0u8; 4];
		for word in words {
			bytes.extend_from_slice(&word.to_be_bytes());
		}
		bytes
	}

	struct SparseFile {
		head: Vec<u8>,
		len: u64,
		at: u64,
	}

	impl Read for SparseFile {
		fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
			let remaining = self.len.saturating_sub(self.at);
			let read = buf
				.len()
				.min(usize::try_from(remaining).unwrap_or(usize::MAX));
			for (slot, at) in buf[..read].iter_mut().zip(self.at..) {
				*slot = usize::try_from(at)
					.ok()
					.and_then(|at| self.head.get(at))
					.copied()
					.unwrap_or(0);
			}
			self.at += read as u64;
			Ok(read)
		}
	}

	impl Seek for SparseFile {
		fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
			self.at = match to {
				SeekFrom::Start(at) => Some(at),
				SeekFrom::End(delta) => self.len.checked_add_signed(delta),
				SeekFrom::Current(delta) => self.at.checked_add_signed(delta),
			}
			.ok_or_else(|| io::Error::from(io::ErrorKind::InvalidInput))?;
			Ok(self.at)
		}
	}

	fn movie_with_text_track() -> Vec<u8> {
		let mut stbl = boxed(b"stsz", &table(&[0, 1, 8]));
		stbl.extend(boxed(b"stsc", &table(&[1, 1, 1, 1])));
		stbl.extend(boxed(b"stco", &table(&[1, 0])));
		let mut mdia = hdlr(b"text");
		mdia.extend(boxed(b"minf", &boxed(b"stbl", &stbl)));
		let mut movie = boxed(b"moov", &boxed(b"trak", &boxed(b"mdia", &mdia)));
		let samples = movie.len() as u32 + 8;
		let chunk = movie
			.windows(4)
			.position(|window| window == b"stco")
			.expect("stco")
			+ 12;
		movie[chunk..chunk + 4].copy_from_slice(&samples.to_be_bytes());
		movie.extend(boxed(b"mdat", b"secret!!"));
		movie
	}
}
