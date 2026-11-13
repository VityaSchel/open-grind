use std::fmt::Write;

use resvg::tiny_skia::{
	Path, PathBuilder, PathSegment, Point, Rect, Transform,
};
use resvg::usvg::{
	self, FillRule, Group, LineCap, LineJoin, MaskType, Node, Paint,
	PaintOrder, SpreadMethod, Tree,
};

pub const TILE: f32 = 512.0;
const ADAPTIVE_VIEWPORT: f32 = TILE * 108.0 / 72.0;
const ADAPTIVE_INSET: f32 = (ADAPTIVE_VIEWPORT - TILE) / 2.0;
const NOTIFICATION_LIVE_AREA: f32 = 20.0 / 24.0;
const EPSILON: f32 = 0.01;

#[derive(Clone, Copy, PartialEq)]
pub enum Layout {
	Adaptive,
	Notification,
}

#[derive(Clone, Copy, PartialEq)]
pub enum Tint {
	Original,
	White,
}

pub fn content_bounds(tree: &Tree) -> Option<Rect> {
	let bounds = tree.root().abs_stroke_bounding_box();
	let tile = Rect::from_xywh(0.0, 0.0, TILE, TILE)?;
	bounds.intersect(&tile)
}

pub fn convert(
	tree: &Tree,
	layout: Layout,
	tint: Tint,
) -> Result<String, String> {
	let (size_dp, viewport, base) = match layout {
		Layout::Adaptive => (
			108.0,
			ADAPTIVE_VIEWPORT,
			Transform::from_translate(ADAPTIVE_INSET, ADAPTIVE_INSET),
		),
		Layout::Notification => {
			let bounds = content_bounds(tree).ok_or("empty glyph")?;
			let side =
				bounds.width().max(bounds.height()) / NOTIFICATION_LIVE_AREA;
			(
				24.0,
				side,
				Transform::from_translate(
					(side - bounds.width()) / 2.0 - bounds.x(),
					(side - bounds.height()) / 2.0 - bounds.y(),
				),
			)
		}
	};
	let frame =
		(layout == Layout::Adaptive && tint == Tint::Original).then(|| {
			Rect::from_xywh(ADAPTIVE_INSET, ADAPTIVE_INSET, TILE, TILE).unwrap()
		});
	let mut writer = Writer {
		tint,
		frame,
		viewport,
		body: String::new(),
		depth: 1,
		gradients: false,
	};
	if layout == Layout::Notification {
		let tile = Rect::from_xywh(0.0, 0.0, TILE, TILE).expect("a tile");
		let clip = PathBuilder::from_rect(tile)
			.transform(base)
			.ok_or("degenerate tile")?;
		writer.body.push_str("    <group>\n");
		let _ = writeln!(
			writer.body,
			"        <clip-path android:pathData=\"{}\" />",
			path_data(&clip)
		);
		writer.depth = 2;
		writer.group(tree.root(), base, 1.0)?;
		writer.body.push_str("    </group>\n");
	} else {
		writer.group(tree.root(), base, 1.0)?;
	}
	let mut xml = String::from("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n");
	xml.push_str(
		"<vector xmlns:android=\"http://schemas.android.com/apk/res/android\"",
	);
	if writer.gradients {
		xml.push_str("\n    xmlns:aapt=\"http://schemas.android.com/aapt\"");
	}
	let _ = write!(
		xml,
		"\n    android:width=\"{size_dp}dp\"\n    android:height=\"{size_dp}dp\"\n    android:viewportWidth=\"{v}\"\n    android:viewportHeight=\"{v}\">\n",
		v = number(viewport),
	);
	xml.push_str(&writer.body);
	xml.push_str("</vector>\n");
	Ok(xml)
}

struct Writer {
	tint: Tint,
	frame: Option<Rect>,
	viewport: f32,
	body: String,
	depth: usize,
	gradients: bool,
}

impl Writer {
	fn indent(&mut self) {
		for _ in 0..self.depth {
			self.body.push_str("    ");
		}
	}

	fn group(
		&mut self,
		group: &Group,
		parent: Transform,
		alpha: f32,
	) -> Result<(), String> {
		if !group.filters().is_empty() {
			return Err("filter".into());
		}
		let transform = parent.pre_concat(group.transform());
		let opacity = group.opacity().get();
		if opacity < 1.0 && shape_count(group) > 1 {
			return Err("group opacity over several shapes".into());
		}
		let mut clips = Vec::new();
		if let Some(clip) = group.clip_path() {
			if clip.clip_path().is_some() {
				return Err("nested clip-path".into());
			}
			clips.push(self.clip_data(
				clip.root(),
				transform.pre_concat(clip.transform()),
			)?);
		}
		if let Some(mask) = group.mask() {
			clips.push(self.mask_data(mask, transform)?);
		}
		let opened = !clips.is_empty();
		if opened {
			self.indent();
			self.body.push_str("<group>\n");
			self.depth += 1;
			for clip in clips {
				self.indent();
				let _ = writeln!(
					self.body,
					"<clip-path android:pathData=\"{clip}\" />"
				);
			}
		}
		for child in group.children() {
			match child {
				Node::Group(child) => {
					self.group(child, transform, alpha * opacity)?
				}
				Node::Path(path) => {
					self.path(path, transform, alpha * opacity)?
				}
				Node::Image(_) => return Err("embedded image".into()),
				Node::Text(_) => return Err("text".into()),
			}
		}
		if opened {
			self.depth -= 1;
			self.indent();
			self.body.push_str("</group>\n");
		}
		Ok(())
	}

	fn covers_frame(&self, shapes: &[Path]) -> bool {
		let Some(frame) = self.frame else {
			return false;
		};
		let [shape] = shapes else {
			return false;
		};
		let bounds = shape.bounds();
		(bounds.left() - frame.left()).abs() < 0.5
			&& (bounds.top() - frame.top()).abs() < 0.5
			&& (bounds.right() - frame.right()).abs() < 0.5
			&& (bounds.bottom() - frame.bottom()).abs() < 0.5
			&& shape.segments().all(|segment| {
				matches!(
					segment,
					PathSegment::MoveTo(_)
						| PathSegment::LineTo(_)
						| PathSegment::Close
				)
			})
	}

	fn whole_viewport(&self) -> String {
		let v = number(self.viewport);
		format!("M0,0L{v},0L{v},{v}L0,{v}Z")
	}

	fn stretch(&self, data: &Path) -> Option<String> {
		self.covers_frame(std::slice::from_ref(data))
			.then(|| self.whole_viewport())
	}

	fn clip_data(
		&mut self,
		root: &Group,
		transform: Transform,
	) -> Result<String, String> {
		let mut shapes = Vec::new();
		collect_clip(root, transform, &mut shapes)?;
		if self.covers_frame(&shapes) {
			return Ok(self.whole_viewport());
		}
		Ok(shapes.iter().map(path_data).collect())
	}

	fn mask_data(
		&mut self,
		mask: &usvg::Mask,
		transform: Transform,
	) -> Result<String, String> {
		if mask.mask().is_some() {
			return Err("nested mask".into());
		}
		let mut data = String::new();
		for child in mask.root().children() {
			let Node::Path(path) = child else {
				return Err("mask holds more than shapes".into());
			};
			let opaque = path.stroke().is_none()
				&& path.fill().is_some_and(|fill| {
					fill.opacity().get() >= 1.0
						&& match fill.paint() {
							Paint::Color(color) => {
								mask.kind() == MaskType::Alpha
									|| (color.red, color.green, color.blue)
										== (255, 255, 255)
							}
							_ => false,
						}
				});
			if !opaque {
				return Err("mask with partial coverage".into());
			}
			let shape = path
				.data()
				.clone()
				.transform(transform)
				.ok_or("degenerate mask")?;
			data.push_str(&path_data(&shape));
		}
		Ok(data)
	}

	fn path(
		&mut self,
		path: &usvg::Path,
		transform: Transform,
		alpha: f32,
	) -> Result<(), String> {
		if !path.is_visible() {
			return Ok(());
		}
		if path.fill().is_some()
			&& path.stroke().is_some()
			&& path.paint_order() == PaintOrder::StrokeAndFill
		{
			return Err("stroke painted under fill".into());
		}
		let Some(data) = path.data().clone().transform(transform) else {
			return Ok(());
		};
		let path_data = self.stretch(&data).unwrap_or_else(|| path_data(&data));
		let mut attributes = vec![format!("android:pathData=\"{path_data}\"")];
		let mut gradient = None;
		if let Some(fill) = path.fill() {
			let opacity = fill.opacity().get() * alpha;
			match fill.paint() {
				Paint::Color(color) => attributes.push(format!(
					"android:fillColor=\"{}\"",
					self.color(*color, opacity)
				)),
				Paint::LinearGradient(linear) => {
					gradient = Some(self.linear(linear, transform, opacity));
				}
				Paint::RadialGradient(radial) => {
					gradient = Some(self.radial(radial, transform, opacity)?);
				}
				Paint::Pattern(_) => return Err("pattern fill".into()),
			}
			if fill.rule() == FillRule::EvenOdd {
				attributes.push("android:fillType=\"evenOdd\"".into());
			}
		}
		if let Some(stroke) = path.stroke() {
			let Paint::Color(color) = stroke.paint() else {
				return Err("gradient stroke".into());
			};
			if stroke.dasharray().is_some() {
				return Err("dashed stroke".into());
			}
			let scale =
				uniform_scale(transform).ok_or("stroke under a skew")?;
			attributes.push(format!(
				"android:strokeColor=\"{}\"",
				self.color(*color, stroke.opacity().get() * alpha)
			));
			attributes.push(format!(
				"android:strokeWidth=\"{}\"",
				number(stroke.width().get() * scale)
			));
			attributes.push(format!(
				"android:strokeLineCap=\"{}\"",
				match stroke.linecap() {
					LineCap::Butt => "butt",
					LineCap::Round => "round",
					LineCap::Square => "square",
				}
			));
			attributes.push(format!(
				"android:strokeLineJoin=\"{}\"",
				match stroke.linejoin() {
					LineJoin::Miter | LineJoin::MiterClip => "miter",
					LineJoin::Round => "round",
					LineJoin::Bevel => "bevel",
				}
			));
			attributes.push(format!(
				"android:strokeMiterLimit=\"{}\"",
				number(stroke.miterlimit().get())
			));
		}
		self.indent();
		self.body.push_str("<path");
		for attribute in attributes {
			self.body.push(' ');
			self.body.push_str(&attribute);
		}
		match gradient {
			None => self.body.push_str(" />\n"),
			Some(gradient) => {
				self.gradients = true;
				self.body.push_str(">\n");
				self.depth += 1;
				self.indent();
				self.body
					.push_str("<aapt:attr name=\"android:fillColor\">\n");
				self.depth += 1;
				self.indent();
				self.body.push_str(&gradient.open);
				self.body.push('\n');
				self.depth += 1;
				for item in gradient.items {
					self.indent();
					self.body.push_str(&item);
					self.body.push('\n');
				}
				self.depth -= 1;
				self.indent();
				self.body.push_str("</gradient>\n");
				self.depth -= 1;
				self.indent();
				self.body.push_str("</aapt:attr>\n");
				self.depth -= 1;
				self.indent();
				self.body.push_str("</path>\n");
			}
		}
		Ok(())
	}

	fn color(&self, color: usvg::Color, opacity: f32) -> String {
		let (red, green, blue) = match self.tint {
			Tint::Original => (color.red, color.green, color.blue),
			Tint::White => (255, 255, 255),
		};
		let alpha = (opacity.clamp(0.0, 1.0) * 255.0).round() as u8;
		format!("#{alpha:02X}{red:02X}{green:02X}{blue:02X}")
	}

	fn stops(&self, stops: &[usvg::Stop], opacity: f32) -> Vec<String> {
		stops
			.iter()
			.map(|stop| {
				format!(
					"<item android:offset=\"{}\" android:color=\"{}\" />",
					number(stop.offset().get()),
					self.color(stop.color(), stop.opacity().get() * opacity)
				)
			})
			.collect()
	}

	fn linear(
		&self,
		gradient: &usvg::LinearGradient,
		transform: Transform,
		opacity: f32,
	) -> Gradient {
		let matrix = transform.pre_concat(gradient.transform());
		let mut start = Point::from_xy(gradient.x1(), gradient.y1());
		matrix.map_point(&mut start);
		let (dx, dy) =
			(gradient.x2() - gradient.x1(), gradient.y2() - gradient.y1());
		let squared = dx * dx + dy * dy;
		let determinant = matrix.sx * matrix.sy - matrix.kx * matrix.ky;
		let wx = (matrix.sy * dx - matrix.ky * dy) / determinant / squared;
		let wy = (-matrix.kx * dx + matrix.sx * dy) / determinant / squared;
		let length = wx * wx + wy * wy;
		let end = Point::from_xy(start.x + wx / length, start.y + wy / length);
		Gradient {
			open: format!(
				"<gradient android:type=\"linear\" android:startX=\"{}\" android:startY=\"{}\" android:endX=\"{}\" android:endY=\"{}\" android:tileMode=\"{}\">",
				number(start.x),
				number(start.y),
				number(end.x),
				number(end.y),
				tile_mode(gradient.spread_method())
			),
			items: self.stops(gradient.stops(), opacity),
		}
	}

	fn radial(
		&self,
		gradient: &usvg::RadialGradient,
		transform: Transform,
		opacity: f32,
	) -> Result<Gradient, String> {
		if (gradient.fx() - gradient.cx()).abs() > EPSILON
			|| (gradient.fy() - gradient.cy()).abs() > EPSILON
			|| gradient.fr().get() > EPSILON
		{
			return Err("focal radial gradient".into());
		}
		let matrix = transform.pre_concat(gradient.transform());
		let scale =
			uniform_scale(matrix).ok_or("elliptical radial gradient")?;
		let mut center = Point::from_xy(gradient.cx(), gradient.cy());
		matrix.map_point(&mut center);
		Ok(Gradient {
			open: format!(
				"<gradient android:type=\"radial\" android:centerX=\"{}\" android:centerY=\"{}\" android:gradientRadius=\"{}\" android:tileMode=\"{}\">",
				number(center.x),
				number(center.y),
				number(gradient.r().get() * scale),
				tile_mode(gradient.spread_method())
			),
			items: self.stops(gradient.stops(), opacity),
		})
	}
}

struct Gradient {
	open: String,
	items: Vec<String>,
}

fn collect_clip(
	group: &Group,
	transform: Transform,
	shapes: &mut Vec<Path>,
) -> Result<(), String> {
	if group.clip_path().is_some() || group.mask().is_some() {
		return Err("clip-path inside a clip-path".into());
	}
	let transform = transform.pre_concat(group.transform());
	for child in group.children() {
		match child {
			Node::Group(child) => collect_clip(child, transform, shapes)?,
			Node::Path(path) => {
				if let Some(shape) = path.data().clone().transform(transform) {
					shapes.push(shape);
				}
			}
			_ => return Err("clip-path holds more than shapes".into()),
		}
	}
	Ok(())
}

fn shape_count(group: &Group) -> usize {
	group
		.children()
		.iter()
		.map(|child| match child {
			Node::Group(child) => shape_count(child),
			_ => 1,
		})
		.sum()
}

fn uniform_scale(matrix: Transform) -> Option<f32> {
	let (x, y) = matrix.get_scale();
	let orthogonal =
		(matrix.sx * matrix.kx + matrix.ky * matrix.sy).abs() < EPSILON;
	((x - y).abs() < EPSILON * x.max(1.0) && orthogonal).then_some(x)
}

fn tile_mode(spread: SpreadMethod) -> &'static str {
	match spread {
		SpreadMethod::Pad => "clamp",
		SpreadMethod::Reflect => "mirror",
		SpreadMethod::Repeat => "repeat",
	}
}

pub fn path_data(path: &Path) -> String {
	let mut data = String::new();
	for segment in path.segments() {
		match segment {
			PathSegment::MoveTo(p) => {
				let _ = write!(data, "M{},{}", number(p.x), number(p.y));
			}
			PathSegment::LineTo(p) => {
				let _ = write!(data, "L{},{}", number(p.x), number(p.y));
			}
			PathSegment::QuadTo(a, p) => {
				let _ = write!(
					data,
					"Q{},{} {},{}",
					number(a.x),
					number(a.y),
					number(p.x),
					number(p.y)
				);
			}
			PathSegment::CubicTo(a, b, p) => {
				let _ = write!(
					data,
					"C{},{} {},{} {},{}",
					number(a.x),
					number(a.y),
					number(b.x),
					number(b.y),
					number(p.x),
					number(p.y)
				);
			}
			PathSegment::Close => data.push('Z'),
		}
	}
	data
}

fn number(value: f32) -> String {
	let text = format!("{:.3}", (value * 1000.0).round() / 1000.0);
	let text = text.trim_end_matches('0').trim_end_matches('.');
	match text {
		"-0" | "" => "0".into(),
		text => text.into(),
	}
}
