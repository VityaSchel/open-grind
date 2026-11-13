use std::fmt::Write;
use std::fs;
use std::path::{Path, PathBuf};

use resvg::tiny_skia::{Color, Mask, MaskType, Pixmap, Transform};
use resvg::usvg::{Options, Tree};

const ART: &str = "disguise/color";
const PRESETS: &str = "src/disguise/presets.json";
const ORIGINAL_ICON: &str = "../contrib/logo/app-icon.svg";
const ORIGINAL_BACKGROUND: [u8; 3] = [0x0A, 0x0A, 0x0A];
const TILE: f32 = 512.0;
const PREVIEW: u32 = 128;
const LINUX: u32 = 256;
const MACOS: u32 = 512;
const MACOS_BODY: f32 = 412.0;
const MACOS_RADIUS: f32 = 92.7;
const WINDOWS: [u32; 8] = [256, 64, 48, 40, 32, 24, 20, 16];

fn parse(path: &Path) -> Tree {
	let data = fs::read(path)
		.unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
	Tree::from_data(&data, &Options::default())
		.unwrap_or_else(|error| panic!("parse {}: {error}", path.display()))
}

fn fitted(tree: &Tree, size: f32) -> Transform {
	let scale = size / tree.size().width().max(tree.size().height());
	Transform::from_scale(scale, scale)
}

fn render(tree: &Tree, size: u32, transform: Transform) -> Pixmap {
	let mut pixmap = Pixmap::new(size, size).expect("a non-empty canvas");
	resvg::render(tree, transform, &mut pixmap.as_mut());
	pixmap
}

fn png(pixmap: &Pixmap) -> Vec<u8> {
	pixmap.encode_png().expect("an in-memory PNG")
}

fn original_preview(manifest_dir: &Path) -> Vec<u8> {
	let tree = parse(&manifest_dir.join(ORIGINAL_ICON));
	let mut pixmap = Pixmap::new(PREVIEW, PREVIEW).expect("a non-empty canvas");
	let [red, green, blue] = ORIGINAL_BACKGROUND;
	pixmap.fill(Color::from_rgba8(red, green, blue, 255));
	resvg::render(&tree, fitted(&tree, PREVIEW as f32), &mut pixmap.as_mut());
	png(&pixmap)
}

fn macos(tree: &Tree) -> Vec<u8> {
	let inset = (MACOS as f32 - MACOS_BODY) / 2.0;
	let mut icon = render(
		tree,
		MACOS,
		Transform::from_scale(MACOS_BODY / TILE, MACOS_BODY / TILE)
			.post_translate(inset, inset),
	);
	let shape = Tree::from_str(
		&format!(
			"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{MACOS}\" height=\"{MACOS}\"><rect x=\"{inset}\" y=\"{inset}\" width=\"{MACOS_BODY}\" height=\"{MACOS_BODY}\" rx=\"{MACOS_RADIUS}\"/></svg>"
		),
		&Options::default(),
	)
	.expect("a rounded square");
	let shape = render(&shape, MACOS, Transform::identity());
	icon.apply_mask(&Mask::from_pixmap(shape.as_ref(), MaskType::Alpha));
	png(&icon)
}

fn windows(tree: &Tree) -> Vec<u8> {
	let frames: Vec<(u32, Vec<u8>)> = WINDOWS
		.iter()
		.map(|&size| {
			(size, png(&render(tree, size, fitted(tree, size as f32))))
		})
		.collect();
	let directory = 6 + 16 * frames.len();
	let mut ico = Vec::new();
	ico.extend_from_slice(&[0, 0, 1, 0]);
	ico.extend_from_slice(&(frames.len() as u16).to_le_bytes());
	let mut offset = directory as u32;
	for (size, data) in &frames {
		ico.push((size % 256) as u8);
		ico.push((size % 256) as u8);
		ico.extend_from_slice(&[0, 0, 1, 0, 32, 0]);
		ico.extend_from_slice(&(data.len() as u32).to_le_bytes());
		ico.extend_from_slice(&offset.to_le_bytes());
		offset += data.len() as u32;
	}
	for (_, data) in frames {
		ico.extend_from_slice(&data);
	}
	ico
}

fn table(name: &str, entries: &[(String, PathBuf)]) -> String {
	let mut rust = format!("pub(super) const {name}: &[(&str, &[u8])] = &[\n");
	for (id, path) in entries {
		let _ = writeln!(
			rust,
			"\t({id:?}, include_bytes!({:?})),",
			path.display().to_string()
		);
	}
	rust.push_str("];\n");
	rust
}

pub fn generate(manifest_dir: &Path, out_dir: &Path, target_os: &str) {
	println!("cargo:rerun-if-changed={ART}");
	println!("cargo:rerun-if-changed={PRESETS}");
	println!("cargo:rerun-if-changed={ORIGINAL_ICON}");
	let presets: Vec<serde_json::Value> = serde_json::from_str(
		&fs::read_to_string(manifest_dir.join(PRESETS))
			.expect("read presets.json"),
	)
	.expect("parse presets.json");
	let ids: Vec<String> = presets
		.iter()
		.map(|preset| preset["id"].as_str().expect("a preset id").to_owned())
		.collect();
	let dir = out_dir.join("disguise");
	fs::create_dir_all(&dir).expect("create the disguise output folder");
	let write = |name: String, data: Vec<u8>| {
		let path = dir.join(name);
		fs::write(&path, data).expect("write a disguise icon");
		path
	};

	let mut previews = vec![(
		"original".to_owned(),
		write("original.png".into(), original_preview(manifest_dir)),
	)];
	let mut icons = Vec::new();
	for id in &ids {
		let tree = parse(&manifest_dir.join(ART).join(format!("{id}.svg")));
		previews.push((
			id.clone(),
			write(
				format!("{id}.preview.png"),
				png(&render(&tree, PREVIEW, fitted(&tree, PREVIEW as f32))),
			),
		));
		let icon = match target_os {
			"linux" => Some((
				format!("{id}.png"),
				png(&render(&tree, LINUX, fitted(&tree, LINUX as f32))),
			)),
			"macos" => Some((format!("{id}.png"), macos(&tree))),
			"windows" => Some((format!("{id}.ico"), windows(&tree))),
			"android" | "ios" => None,
			other => panic!("no disguise icon format for {other}"),
		};
		if let Some((name, data)) = icon {
			icons.push((id.clone(), write(name, data)));
		}
	}

	let mut rust = table("PREVIEWS", &previews);
	if !icons.is_empty() {
		rust.push_str(&table("ICONS", &icons));
	}
	fs::write(out_dir.join("disguise_icons.rs"), rust)
		.expect("write disguise_icons.rs");
}
