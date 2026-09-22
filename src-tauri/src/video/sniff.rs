const BOX_TYPE: &[u8] = b"ftyp";
const VIDEO_BRANDS: [&[u8]; 5] = [b"qt  ", b"avc1", b"M4V ", b"f4v ", b"mmp4"];
const VIDEO_BRAND_PREFIXES: [&[u8]; 3] = [b"iso", b"mp4", b"3g"];

pub fn is_video(head: &[u8]) -> bool {
	let Some(brand) = head.get(8..12) else {
		return false;
	};
	head.get(4..8) == Some(BOX_TYPE)
		&& (VIDEO_BRANDS.contains(&brand)
			|| VIDEO_BRAND_PREFIXES
				.iter()
				.any(|prefix| brand.starts_with(prefix)))
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::video::test_support::boxed;

	const FASTSTART: &[u8] = include_bytes!("fixtures/faststart.mp4");
	const QUICKTIME: &[u8] = include_bytes!("fixtures/quicktime.mov");

	fn file_type(brand: &[u8; 4]) -> Vec<u8> {
		let mut body = brand.to_vec();
		body.extend_from_slice(&[0u8; 4]);
		boxed(b"ftyp", &body)
	}

	#[test]
	fn an_mp4_is_video() {
		assert!(is_video(FASTSTART));
		assert!(is_video(&file_type(b"mp42")));
		assert!(is_video(&file_type(b"avc1")));
	}

	#[test]
	fn a_quicktime_movie_is_video() {
		assert!(is_video(QUICKTIME));
		assert!(is_video(&file_type(b"qt  ")));
	}

	#[test]
	fn a_3gp_clip_is_video() {
		assert!(is_video(&file_type(b"3gp4")));
		assert!(is_video(&file_type(b"3g2a")));
	}

	#[test]
	fn a_heic_photo_is_not_video() {
		assert!(!is_video(&file_type(b"heic")));
		assert!(!is_video(&file_type(b"mif1")));
		assert!(!is_video(&file_type(b"avif")));
	}

	#[test]
	fn a_video_brand_outside_a_file_type_box_is_not_video() {
		assert!(!is_video(&boxed(b"moov", b"isom\0\0\0\0")));
	}

	#[test]
	fn a_head_too_short_to_hold_a_brand_is_not_video() {
		assert!(!is_video(b""));
		assert!(!is_video(&FASTSTART[..11]));
	}
}
