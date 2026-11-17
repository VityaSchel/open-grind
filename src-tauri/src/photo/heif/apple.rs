use objc2_core_foundation::{
	CFBoolean, CFData, CFDictionary, CFMutableData, CFNumber, CFString, CFType,
};
use objc2_image_io::{
	kCGImageSourceCreateThumbnailFromImageAlways,
	kCGImageSourceCreateThumbnailWithTransform,
	kCGImageSourceThumbnailMaxPixelSize, CGImageDestination, CGImageSource,
};

use crate::error::AppError;
use crate::photo::encode::MAX_EDGE;
use crate::photo::source::{self, Format, Source};

const PNG: &str = "public.png";

pub async fn decode(bytes: Vec<u8>) -> Result<Source, AppError> {
	crate::photo::off_thread(move || to_source(&bytes))
		.await?
		.ok_or_else(crate::photo::damaged)
}

fn to_source(bytes: &[u8]) -> Option<Source> {
	source::decode(Format::Png, &to_png(bytes)?)
}

fn to_png(bytes: &[u8]) -> Option<Vec<u8>> {
	let image =
		unsafe { CGImageSource::with_data(&CFData::from_bytes(bytes), None) }?;
	let max_edge = CFNumber::new_i64(i64::from(MAX_EDGE));
	let always = CFBoolean::new(true);
	let options = CFDictionary::<CFString, CFType>::from_slices(
		unsafe {
			&[
				kCGImageSourceCreateThumbnailFromImageAlways,
				kCGImageSourceCreateThumbnailWithTransform,
				kCGImageSourceThumbnailMaxPixelSize,
			]
		},
		&[always.as_ref(), always.as_ref(), max_edge.as_ref()],
	);
	let primary = unsafe { image.primary_image_index() };
	let upright = unsafe {
		image.thumbnail_at_index(primary, Some(options.as_opaque()))
	}?;

	let png = CFMutableData::new(None, 0)?;
	let destination = unsafe {
		CGImageDestination::with_data(
			&png,
			&CFString::from_static_str(PNG),
			1,
			None,
		)
	}?;
	unsafe { destination.add_image(&upright, None) };
	unsafe { destination.finalize() }.then(|| png.to_vec())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
	use image::metadata::Orientation;
	use image::{GenericImageView, Rgba};

	use super::*;

	const LANDSCAPE: &[u8] = include_bytes!("fixtures/landscape.heic");
	const ROTATED: &[u8] = include_bytes!("fixtures/rotated.heic");
	const SECOND_PRIMARY: &[u8] =
		include_bytes!("fixtures/second-primary.heic");

	fn is_red(Rgba([red, _, blue, _]): Rgba<u8>) -> bool {
		red > 160 && blue < 100
	}

	fn is_blue(Rgba([red, _, blue, _]): Rgba<u8>) -> bool {
		red < 100 && blue > 140
	}

	#[test]
	fn a_large_heic_shrinks_to_the_upload_edge() {
		let source = to_source(LANDSCAPE).expect("decode");

		assert_eq!(source.image.dimensions(), (MAX_EDGE, MAX_EDGE / 2));
		assert_eq!(source.orientation, Orientation::NoTransforms);
		assert!(is_red(source.image.get_pixel(128, 128)));
		assert!(is_blue(source.image.get_pixel(768, 384)));
	}

	#[test]
	fn a_rotated_heic_arrives_upright() {
		let source = to_source(ROTATED).expect("decode");

		assert_eq!(source.image.dimensions(), (48, 96));
		assert_eq!(source.orientation, Orientation::NoTransforms);
		assert!(is_red(source.image.get_pixel(36, 12)));
		assert!(is_blue(source.image.get_pixel(12, 12)));
		assert!(is_blue(source.image.get_pixel(24, 72)));
	}

	#[test]
	fn a_multi_image_heic_uploads_its_primary_image() {
		let source = to_source(SECOND_PRIMARY).expect("decode");

		assert_eq!(source.image.dimensions(), (16, 32));
		assert!(is_red(source.image.get_pixel(8, 16)));
	}

	#[test]
	fn a_truncated_heic_is_not_decoded() {
		assert!(to_source(&ROTATED[..ROTATED.len() / 2]).is_none());
	}
}
