use resvg::tiny_skia::{FilterQuality, Pixmap, PixmapPaint, Transform};
use resvg::usvg::Tree;

use crate::vector::{content_bounds, TILE};

const LAYER: u32 = 432;
const LAYER_TILE: u32 = 288;
const NOTIFICATION: u32 = 96;
const NOTIFICATION_LIVE_AREA: f32 = 80.0;

fn render(tree: &Tree, size: u32, transform: Transform) -> Pixmap {
	let mut pixmap = Pixmap::new(size, size).expect("a non-empty canvas");
	resvg::render(tree, transform, &mut pixmap.as_mut());
	pixmap
}

fn png(pixmap: &Pixmap) -> Vec<u8> {
	pixmap.encode_png().expect("an in-memory PNG")
}

pub fn foreground(tree: &Tree) -> Vec<u8> {
	let scale = LAYER_TILE as f32 / TILE;
	let tile = render(tree, LAYER_TILE, Transform::from_scale(scale, scale));
	let inset = (LAYER - LAYER_TILE) / 2;
	let mut layer = Pixmap::new(LAYER, LAYER).expect("a non-empty canvas");
	let source = tile.pixels();
	let width = LAYER as usize;
	for (index, pixel) in layer.pixels_mut().iter_mut().enumerate() {
		let x = (index % width) as u32;
		let y = (index / width) as u32;
		let sx = x.saturating_sub(inset).min(LAYER_TILE - 1);
		let sy = y.saturating_sub(inset).min(LAYER_TILE - 1);
		*pixel = source[(sy * LAYER_TILE + sx) as usize];
	}
	png(&layer)
}

pub fn monochrome(tree: &Tree) -> Vec<u8> {
	let scale = LAYER_TILE as f32 / TILE;
	let inset = (LAYER - LAYER_TILE) as f32 / 2.0;
	png(&render(
		tree,
		LAYER,
		Transform::from_scale(scale, scale).post_translate(inset, inset),
	))
}

pub fn notification(tree: &Tree) -> Vec<u8> {
	let bounds = content_bounds(tree).expect("a glyph with content");
	let tile = render(tree, TILE as u32, Transform::identity());
	let scale = NOTIFICATION_LIVE_AREA / bounds.width().max(bounds.height());
	let canvas = NOTIFICATION as f32;
	let mut glyph =
		Pixmap::new(NOTIFICATION, NOTIFICATION).expect("a non-empty canvas");
	glyph.draw_pixmap(
		0,
		0,
		tile.as_ref(),
		&PixmapPaint {
			quality: FilterQuality::Bicubic,
			..PixmapPaint::default()
		},
		Transform::from_translate(-bounds.x(), -bounds.y())
			.post_scale(scale, scale)
			.post_translate(
				(canvas - bounds.width() * scale) / 2.0,
				(canvas - bounds.height() * scale) / 2.0,
			),
		None,
	);
	png(&glyph)
}
