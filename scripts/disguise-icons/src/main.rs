mod android;
mod raster;
mod vector;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use resvg::usvg::{Options, Tree};
use serde::Deserialize;

use vector::{Layout, Tint};

#[derive(Deserialize)]
pub struct Preset {
	id: String,
	name: String,
}

const GENERATED_PREFIX: &str = "disguise_";
const GENERATED_DIRS: [&str; 4] = [
	"drawable",
	"drawable-xxxhdpi",
	"mipmap-anydpi-v26",
	"mipmap-xxxhdpi",
];

fn repo() -> PathBuf {
	Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn parse(path: &Path) -> Result<Tree, String> {
	let data = fs::read(path)
		.map_err(|error| format!("{}: {error}", path.display()))?;
	Tree::from_data(&data, &Options::default())
		.map_err(|error| format!("{}: {error}", path.display()))
}

fn clear(res: &Path) -> Result<(), String> {
	for dir in GENERATED_DIRS {
		let Ok(entries) = fs::read_dir(res.join(dir)) else {
			continue;
		};
		for entry in entries.filter_map(Result::ok) {
			if entry
				.file_name()
				.to_string_lossy()
				.starts_with(GENERATED_PREFIX)
			{
				fs::remove_file(entry.path())
					.map_err(|error| error.to_string())?;
			}
		}
	}
	Ok(())
}

fn write(path: PathBuf, contents: impl AsRef<[u8]>) -> Result<(), String> {
	if let Some(parent) = path.parent() {
		fs::create_dir_all(parent).map_err(|error| error.to_string())?;
	}
	fs::write(&path, contents)
		.map_err(|error| format!("{}: {error}", path.display()))
}

fn write_layer(
	res: &Path,
	name: &str,
	vector: Result<String, String>,
	raster: impl FnOnce() -> Vec<u8>,
	rasters: &mut Vec<String>,
) -> Result<(), String> {
	match vector {
		Ok(xml) => write(res.join("drawable").join(format!("{name}.xml")), xml),
		Err(reason) => {
			rasters.push(format!("{name} ({reason})"));
			write(
				res.join("drawable-xxxhdpi").join(format!("{name}.png")),
				raster(),
			)
		}
	}
}

fn run() -> Result<(), String> {
	let repo = repo();
	let presets: Vec<Preset> = serde_json::from_str(
		&fs::read_to_string(repo.join("src-tauri/src/disguise/presets.json"))
			.map_err(|error| error.to_string())?,
	)
	.map_err(|error| error.to_string())?;
	let art = repo.join("src-tauri/disguise");
	let main = repo.join("src-tauri/gen/android/app/src/main");
	let res = main.join("res");
	clear(&res)?;
	let mut rasters = Vec::new();
	for preset in &presets {
		let color =
			parse(&art.join("color").join(format!("{}.svg", preset.id)))?;
		let mono = parse(&art.join("mono").join(format!("{}.svg", preset.id)))?;
		let name = android::resource_name(preset);
		write_layer(
			&res,
			&format!("{name}_foreground"),
			vector::convert(&color, Layout::Adaptive, Tint::Original),
			|| raster::foreground(&color),
			&mut rasters,
		)?;
		write_layer(
			&res,
			&format!("{name}_monochrome"),
			vector::convert(&mono, Layout::Adaptive, Tint::White),
			|| raster::monochrome(&mono),
			&mut rasters,
		)?;
		write_layer(
			&res,
			&format!("{name}_notification"),
			vector::convert(&mono, Layout::Notification, Tint::White),
			|| raster::notification(&mono),
			&mut rasters,
		)?;
		write(
			res.join("mipmap-anydpi-v26").join(format!("{name}.xml")),
			android::adaptive_icon(preset),
		)?;
	}
	write(res.join("values/disguise.xml"), android::strings(&presets))?;
	android::write_manifest_aliases(
		&main.join("AndroidManifest.xml"),
		&presets,
	)?;
	println!(
		"{} presets, {} raster layers:\n{}",
		presets.len(),
		rasters.len(),
		rasters.join("\n")
	);
	Ok(())
}

fn main() -> ExitCode {
	match run() {
		Ok(()) => ExitCode::SUCCESS,
		Err(error) => {
			eprintln!("{error}");
			ExitCode::FAILURE
		}
	}
}
