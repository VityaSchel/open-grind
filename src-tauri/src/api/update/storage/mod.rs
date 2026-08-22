use std::fs;
use std::path::{Path, PathBuf};

use semver::Version;

use super::error::UpdateError;
use super::release::Candidate;

mod staged;
pub use staged::Staged;

pub(super) const SCHEMA: u32 = 1;
const STATE_FILE: &str = "state.json";
const PAYLOAD_FILE: &str = "payload";
const PART_FILE: &str = "payload.part";

#[derive(Debug, Clone)]
pub struct Stage {
	dir: PathBuf,
}

impl Stage {
	pub fn payload(&self) -> PathBuf {
		self.dir.join(PAYLOAD_FILE)
	}

	pub fn part(&self) -> PathBuf {
		self.dir.join(PART_FILE)
	}

	fn state(&self) -> PathBuf {
		self.dir.join(STATE_FILE)
	}

	pub fn create(&self) -> Result<(), UpdateError> {
		fs::create_dir_all(&self.dir)?;
		Ok(())
	}

	pub fn load(&self) -> Option<Staged> {
		let raw = fs::read(self.state()).ok()?;
		let staged: Staged = serde_json::from_slice(&raw).ok()?;
		(staged.schema == SCHEMA).then_some(staged)
	}

	pub fn save(&self, staged: &Staged) -> Result<(), UpdateError> {
		let encoded = serde_json::to_vec(staged)
			.map_err(|e| UpdateError::Storage(e.to_string()))?;
		write_durably(&self.state(), &encoded)
	}

	pub fn discard(&self) -> Result<(), UpdateError> {
		match fs::remove_dir_all(&self.dir) {
			Ok(()) => Ok(()),
			Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
			Err(e) => Err(e.into()),
		}
	}

	pub fn sweep_strays(&self) -> Result<(), UpdateError> {
		let known = [STATE_FILE, PAYLOAD_FILE, PART_FILE];
		for entry in read_dir(&self.dir) {
			let path = entry.path();
			let keep = path
				.file_name()
				.and_then(|name| name.to_str())
				.is_some_and(|name| known.contains(&name));
			if !keep {
				let _ = fs::remove_file(&path)
					.or_else(|_| fs::remove_dir_all(&path));
			}
		}
		Ok(())
	}
}

pub(super) fn write_durably(
	path: &Path,
	bytes: &[u8],
) -> Result<(), UpdateError> {
	let temp = path.with_extension("json.tmp");
	fs::write(&temp, bytes)?;
	fs::File::open(&temp)?.sync_data()?;
	fs::rename(&temp, path)?;
	Ok(())
}

pub fn root<R: tauri::Runtime>(
	app: &tauri::AppHandle<R>,
) -> Result<PathBuf, UpdateError> {
	use tauri::Manager;

	let cache = app
		.path()
		.app_cache_dir()
		.map_err(|e| UpdateError::Storage(e.to_string()))?;
	Ok(cache.join("updates"))
}

pub fn stage(root: &Path, tag: &str) -> Result<Stage, UpdateError> {
	if !tag_is_safe(tag) {
		return Err(UpdateError::MalformedIndex(format!(
			"unusable release tag {tag}"
		)));
	}
	Ok(Stage {
		dir: root.join(tag),
	})
}

fn tag_is_safe(tag: &str) -> bool {
	!tag.is_empty()
		&& tag.len() <= 64
		&& tag.chars().all(|c| {
			c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '+' | '-')
		}) && !tag.starts_with('.')
}

pub fn purge(root: &Path, current: &Version, keep: Option<&str>) {
	let mut survivors: Vec<(Version, PathBuf)> = Vec::new();

	for entry in read_dir(root) {
		let path = entry.path();
		let name = path
			.file_name()
			.and_then(|name| name.to_str())
			.unwrap_or("");
		let version = Stage { dir: path.clone() }
			.load()
			.and_then(|staged| staged.version());

		let useful = tag_is_safe(name)
			&& version.as_ref().is_some_and(|version| version > current)
			&& keep.is_none_or(|tag| tag == name);

		match (useful, version) {
			(true, Some(version)) => survivors.push((version, path)),
			_ => {
				let _ = fs::remove_dir_all(&path);
			}
		}
	}

	survivors.sort_by(|(left, _), (right, _)| right.cmp(left));
	for (_, path) in survivors.into_iter().skip(1) {
		let _ = fs::remove_dir_all(&path);
	}
}

pub fn resumable(root: &Path, current: &Version) -> Option<Candidate> {
	let mut best: Option<(Version, Staged)> = None;
	for entry in read_dir(root) {
		let stage = Stage { dir: entry.path() };
		let Some(staged) = stage.load() else { continue };
		let Some(version) = staged.version() else {
			continue;
		};
		if version <= *current {
			continue;
		}
		if best.as_ref().is_none_or(|(found, _)| version > *found) {
			best = Some((version, staged));
		}
	}

	let (_, staged) = best?;
	staged.candidate()
}

pub fn verified(root: &Path, current: &Version) -> Option<(Stage, Staged)> {
	let mut best: Option<(Version, Stage, Staged)> = None;
	for entry in read_dir(root) {
		let stage = Stage { dir: entry.path() };
		let Some(staged) = stage.load() else { continue };
		let Some(version) = staged.version() else {
			continue;
		};
		if !staged.verified || version <= *current {
			continue;
		}
		if !staged.payload_on_disk(&stage) {
			continue;
		}
		if best.as_ref().is_none_or(|(found, _, _)| version > *found) {
			best = Some((version, stage, staged));
		}
	}
	best.map(|(_, stage, staged)| (stage, staged))
}

fn read_dir(path: &Path) -> impl Iterator<Item = fs::DirEntry> {
	fs::read_dir(path)
		.into_iter()
		.flatten()
		.filter_map(Result::ok)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn temp_root() -> PathBuf {
		let base = std::env::temp_dir().join(format!(
			"open-grind-update-test-{}-{:?}",
			std::process::id(),
			std::thread::current().id()
		));
		let _ = fs::remove_dir_all(&base);
		fs::create_dir_all(&base).unwrap();
		base
	}

	fn staged(tag: &str, version: &str, verified: bool) -> Staged {
		Staged {
			schema: SCHEMA,
			tag: tag.to_owned(),
			version: version.to_owned(),
			payload_uuid: "bb49c042".into(),
			payload_size: 4,
			payload_url: "https://git.opengrind.org/a.apk".into(),
			signature_url: "https://git.opengrind.org/a.apk.minisig".into(),
			downloaded: 4,
			validator: None,
			verified,
			payload_digest: verified.then(|| "digest".into()),
		}
	}

	fn write_stage(
		root: &Path,
		tag: &str,
		version: &str,
		verified: bool,
		payload: &[u8],
	) -> Stage {
		let stage = stage(root, tag).unwrap();
		stage.create().unwrap();
		fs::write(stage.payload(), payload).unwrap();
		stage.save(&staged(tag, version, verified)).unwrap();
		stage
	}

	#[test]
	fn rejects_tags_that_would_escape_the_stage_root() {
		for tag in ["..", "../evil", "a/b", ".hidden", "", &"x".repeat(65)] {
			assert!(!tag_is_safe(tag), "accepted {tag}");
			assert!(stage(Path::new("/tmp"), tag).is_err());
		}
		assert!(tag_is_safe("v0.1.0-beta.3"));
	}

	#[test]
	fn state_survives_a_save_and_load_round_trip() {
		let root = temp_root();
		let stage = write_stage(&root, "v0.2.0", "0.2.0", true, b"apk!");
		assert_eq!(stage.load().unwrap(), staged("v0.2.0", "0.2.0", true));
	}

	#[test]
	fn purge_keeps_only_the_active_stage() {
		let root = temp_root();
		write_stage(&root, "v0.2.0", "0.2.0", true, b"apk!");
		write_stage(&root, "v0.3.0", "0.3.0", false, b"apk!");
		fs::create_dir_all(root.join("junk")).unwrap();

		purge(&root, &Version::parse("0.1.0").unwrap(), Some("v0.3.0"));

		assert!(!root.join("v0.2.0").exists());
		assert!(!root.join("junk").exists());
		assert!(root.join("v0.3.0").exists());
	}

	#[test]
	fn purge_without_a_target_keeps_only_the_newest_staged_update() {
		let root = temp_root();
		write_stage(&root, "v0.2.0", "0.2.0", true, b"apk!");
		write_stage(&root, "v0.4.0", "0.4.0", true, b"apk!");
		write_stage(&root, "v0.3.0", "0.3.0", false, b"apk!");

		purge(&root, &Version::parse("0.1.0").unwrap(), None);

		assert!(root.join("v0.4.0").exists());
		assert!(!root.join("v0.2.0").exists());
		assert!(!root.join("v0.3.0").exists());
	}

	#[test]
	fn purge_drops_versions_the_running_build_has_reached() {
		let root = temp_root();
		write_stage(&root, "v0.2.0", "0.2.0", true, b"apk!");

		purge(&root, &Version::parse("0.2.0").unwrap(), Some("v0.2.0"));

		assert!(!root.join("v0.2.0").exists());
	}

	#[test]
	fn verified_ignores_unverified_missing_and_truncated_payloads() {
		let root = temp_root();
		let current = Version::parse("0.1.0").unwrap();

		write_stage(&root, "v0.2.0", "0.2.0", false, b"apk!");
		assert!(verified(&root, &current).is_none());

		let short = write_stage(&root, "v0.3.0", "0.3.0", true, b"ap");
		assert!(verified(&root, &current).is_none());
		fs::write(short.payload(), b"apk!").unwrap();
		assert_eq!(verified(&root, &current).unwrap().1.tag, "v0.3.0");

		fs::remove_file(short.payload()).unwrap();
		assert!(verified(&root, &current).is_none());
	}

	#[test]
	fn verified_picks_the_newest_of_several() {
		let root = temp_root();
		write_stage(&root, "v0.2.0", "0.2.0", true, b"apk!");
		write_stage(&root, "v0.4.0", "0.4.0", true, b"apk!");
		write_stage(&root, "v0.3.0", "0.3.0", true, b"apk!");

		let (_, found) =
			verified(&root, &Version::parse("0.1.0").unwrap()).unwrap();
		assert_eq!(found.tag, "v0.4.0");
	}

	#[test]
	fn a_replaced_asset_no_longer_describes_the_staged_bytes() {
		let candidate = Candidate {
			tag: "v0.2.0".into(),
			version: "0.2.0".into(),
			notes: None,
			published_at: None,
			payload: super::super::release::Artifact {
				name: "a.apk".into(),
				url: "https://git.opengrind.org/a.apk".into(),
				uuid: "bb49c042".into(),
				size: 4,
			},
			signature: super::super::release::Artifact {
				name: "a.apk.minisig".into(),
				url: "https://git.opengrind.org/a.apk.minisig".into(),
				uuid: "c45b10ab".into(),
				size: 228,
			},
		};
		let on_disk = staged("v0.2.0", "0.2.0", true);
		assert!(on_disk.describes(&candidate));

		let mut hot_patched = candidate.clone();
		hot_patched.payload.uuid = "99999999".into();
		assert!(!on_disk.describes(&hot_patched));

		let mut resized = candidate.clone();
		resized.payload.size = 5;
		assert!(!on_disk.describes(&resized));
	}

	#[test]
	fn sweep_removes_files_a_crashed_run_left_behind() {
		let root = temp_root();
		let stage = write_stage(&root, "v0.2.0", "0.2.0", true, b"apk!");
		fs::write(stage.part(), b"partial").unwrap();
		fs::write(root.join("v0.2.0").join("payload.apk.1"), b"stray").unwrap();
		fs::write(root.join("v0.2.0").join("state.json.tmp"), b"{}").unwrap();

		stage.sweep_strays().unwrap();

		assert!(stage.payload().exists());
		assert!(stage.part().exists());
		assert!(!root.join("v0.2.0").join("payload.apk.1").exists());
		assert!(!root.join("v0.2.0").join("state.json.tmp").exists());
	}
}
