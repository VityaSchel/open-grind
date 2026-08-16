use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, RgbImage};
use moxcms::{ColorProfile, Layout, TransformOptions};

use super::source::Source;

/// Matches the official Grindr client for Android
pub const MAX_EDGE: u32 = 1024;

const MAX_BYTES: usize = 1024 * 1024;
const QUALITY_STEPS: [u8; 3] = [85, 75, 65];
const OPAQUE_BACKGROUND: u8 = 0xFF;

pub fn to_jpeg(source: Source) -> Option<Vec<u8>> {
	let Source {
		mut image,
		orientation,
		icc,
	} = source;

	image.apply_orientation(orientation);
	let image = downscale(image);
	let mut pixels = flatten(image);
	convert_to_srgb(&mut pixels, icc);

	let mut smallest = None;
	for &quality in &QUALITY_STEPS {
		let jpeg = encode(&pixels, quality)?;
		if jpeg.len() <= MAX_BYTES {
			return Some(jpeg);
		}
		smallest = Some(jpeg);
	}
	smallest
}

fn downscale(image: DynamicImage) -> DynamicImage {
	if image.width() <= MAX_EDGE && image.height() <= MAX_EDGE {
		return image;
	}
	image.resize(MAX_EDGE, MAX_EDGE, FilterType::Lanczos3)
}

fn flatten(image: DynamicImage) -> RgbImage {
	if !image.color().has_alpha() {
		return image.into_rgb8();
	}
	let source = image.into_rgba8();
	let mut flattened = RgbImage::new(source.width(), source.height());
	for (to, from) in flattened.pixels_mut().zip(source.pixels()) {
		let [red, green, blue, alpha] = from.0;
		let over = |channel: u8| {
			let blended = u16::from(channel) * u16::from(alpha)
				+ u16::from(OPAQUE_BACKGROUND)
					* u16::from(OPAQUE_BACKGROUND - alpha);
			(blended / u16::from(OPAQUE_BACKGROUND)) as u8
		};
		to.0 = [over(red), over(green), over(blue)];
	}
	flattened
}

fn convert_to_srgb(pixels: &mut RgbImage, icc: Option<Vec<u8>>) {
	let Some(icc) = icc else { return };
	let Ok(source) = ColorProfile::new_from_slice(&icc) else {
		return;
	};
	let Ok(transform) = source.create_transform_8bit(
		Layout::Rgb,
		&ColorProfile::new_srgb(),
		Layout::Rgb,
		TransformOptions::default(),
	) else {
		return;
	};
	let mut converted = vec![0; pixels.as_raw().len()];
	if transform.transform(pixels.as_raw(), &mut converted).is_ok() {
		pixels.as_mut().copy_from_slice(&converted);
	}
}

fn encode(pixels: &RgbImage, quality: u8) -> Option<Vec<u8>> {
	let mut jpeg = Vec::new();
	JpegEncoder::new_with_quality(&mut jpeg, quality)
		.encode_image(pixels)
		.ok()?;
	Some(jpeg)
}

#[cfg(test)]
mod tests {
	use image::metadata::Orientation;
	use image::{GenericImage, GenericImageView, ImageReader, Rgba};
	use std::io::Cursor;

	use super::*;

	fn source(image: DynamicImage) -> Source {
		Source {
			image,
			orientation: Orientation::NoTransforms,
			icc: None,
		}
	}

	fn decode(jpeg: &[u8]) -> DynamicImage {
		ImageReader::with_format(Cursor::new(jpeg), image::ImageFormat::Jpeg)
			.decode()
			.expect("decode")
	}

	fn noise(width: u32, height: u32) -> DynamicImage {
		let mut image = DynamicImage::new_rgb8(width, height);
		for y in 0..height {
			for x in 0..width {
				let value = ((x * 7 + y * 13) % 251) as u8;
				image.put_pixel(
					x,
					y,
					Rgba([value, value.wrapping_mul(3), 255 - value, 255]),
				);
			}
		}
		image
	}

	#[test]
	fn a_photo_larger_than_the_cap_is_scaled_to_fit_with_its_aspect_kept() {
		let jpeg = to_jpeg(source(noise(4000, 3000))).expect("encode");

		let out = decode(&jpeg);
		assert_eq!(out.width(), MAX_EDGE);
		assert_eq!(out.height(), 768);
	}

	#[test]
	fn a_portrait_photo_is_capped_on_its_long_edge() {
		let jpeg = to_jpeg(source(noise(1500, 3000))).expect("encode");

		let out = decode(&jpeg);
		assert_eq!((out.width(), out.height()), (512, MAX_EDGE));
	}

	#[test]
	fn a_photo_already_under_the_cap_is_never_upscaled() {
		let jpeg = to_jpeg(source(noise(300, 200))).expect("encode");

		assert_eq!(decode(&jpeg).dimensions(), (300, 200));
	}

	#[test]
	fn a_photo_exactly_at_the_cap_is_left_alone() {
		let jpeg = to_jpeg(source(noise(MAX_EDGE, MAX_EDGE))).expect("encode");

		assert_eq!(decode(&jpeg).dimensions(), (MAX_EDGE, MAX_EDGE));
	}

	#[test]
	fn an_extreme_aspect_ratio_never_collapses_an_edge_to_zero() {
		let jpeg = to_jpeg(source(noise(8000, 1))).expect("encode");

		let out = decode(&jpeg);
		assert_eq!(out.width(), MAX_EDGE);
		assert!(out.height() >= 1, "height collapsed to {}", out.height());
	}

	#[test]
	fn a_single_pixel_survives() {
		let jpeg = to_jpeg(source(noise(1, 1))).expect("encode");

		assert_eq!(decode(&jpeg).dimensions(), (1, 1));
	}

	#[test]
	fn orientation_is_applied_before_the_cap_so_the_long_edge_is_the_upright_one(
	) {
		let mut turned = source(noise(4000, 3000));
		turned.orientation = Orientation::Rotate90;

		let jpeg = to_jpeg(turned).expect("encode");

		let out = decode(&jpeg);
		assert_eq!((out.width(), out.height()), (768, MAX_EDGE));
	}

	#[test]
	fn every_exif_orientation_produces_an_upright_photo() {
		for exif in 1..=8 {
			let orientation =
				Orientation::from_exif(exif).expect("orientation");
			let mut turned = source(noise(400, 200));
			turned.orientation = orientation;

			let out = decode(&to_jpeg(turned).expect("encode"));

			let expected = if matches!(exif, 5..=8) {
				(200, 400)
			} else {
				(400, 200)
			};
			assert_eq!(out.dimensions(), expected, "exif orientation {exif}");
		}
	}

	#[test]
	fn transparent_pixels_resolve_to_the_background_not_to_hidden_color() {
		let mut image = DynamicImage::new_rgba8(8, 8);
		for y in 0..8 {
			for x in 0..8 {
				image.put_pixel(x, y, Rgba([255, 0, 0, 0]));
			}
		}

		let out = decode(&to_jpeg(source(image)).expect("encode"));

		let pixel = out.get_pixel(4, 4);
		assert!(
			pixel[0] > 240 && pixel[1] > 240 && pixel[2] > 240,
			"hidden red leaked through: {pixel:?}"
		);
	}

	#[test]
	fn a_half_transparent_pixel_blends_toward_the_background() {
		let mut image = DynamicImage::new_rgba8(8, 8);
		for y in 0..8 {
			for x in 0..8 {
				image.put_pixel(x, y, Rgba([0, 0, 0, 128]));
			}
		}

		let out = decode(&to_jpeg(source(image)).expect("encode"));

		let pixel = out.get_pixel(4, 4);
		assert!(
			(100..=155).contains(&pixel[0]),
			"expected mid grey, got {pixel:?}"
		);
	}

	#[test]
	fn a_grayscale_photo_round_trips() {
		let jpeg = to_jpeg(source(DynamicImage::ImageLuma8(
			image::GrayImage::from_pixel(64, 32, image::Luma([90])),
		)))
		.expect("encode");

		let out = decode(&jpeg);
		assert_eq!(out.dimensions(), (64, 32));
		assert!((80..=100).contains(&out.get_pixel(10, 10)[0]));
	}

	#[test]
	fn the_encoder_writes_no_metadata_segment_of_its_own() {
		let jpeg = to_jpeg(source(noise(64, 64))).expect("encode");

		let mut decoder =
			image::codecs::jpeg::JpegDecoder::new(Cursor::new(&jpeg))
				.expect("decode");
		assert_eq!(
			image::ImageDecoder::exif_metadata(&mut decoder).expect("exif"),
			None
		);
		assert_eq!(
			image::ImageDecoder::icc_profile(&mut decoder).expect("icc"),
			None
		);
	}

	#[test]
	fn an_unreadable_color_profile_does_not_fail_the_upload() {
		let mut tagged = source(noise(64, 64));
		tagged.icc = Some(vec![0xDE, 0xAD, 0xBE, 0xEF]);

		let jpeg = to_jpeg(tagged).expect("encode");

		assert_eq!(decode(&jpeg).dimensions(), (64, 64));
	}

	#[test]
	fn the_output_stays_under_the_size_ceiling() {
		let jpeg = to_jpeg(source(noise(4000, 4000))).expect("encode");

		assert!(jpeg.len() <= MAX_BYTES, "{} bytes", jpeg.len());
	}
}
