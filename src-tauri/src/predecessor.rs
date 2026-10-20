use std::fs;
use std::path::{Path, PathBuf};

use objc2_app_kit::NSRunningApplication;
use objc2_foundation::{NSBundle, NSString};

const PER_APP_FOLDERS: [&str; 3] = [
	"Library/Application Support",
	"Library/WebKit",
	"Library/Caches",
];

pub fn adopt_data() {
	let Some(identifier) = NSBundle::mainBundle().bundleIdentifier() else {
		return;
	};
	let identifier = identifier.to_string();
	let Some(predecessor) = predecessor_of(&identifier) else {
		return;
	};
	let Some(home) = std::env::var_os("HOME") else {
		return;
	};
	let moves = pending_moves(Path::new(&home), predecessor, &identifier);
	if !moves.is_empty() && is_running(predecessor) {
		ask_to_quit();
	}
	move_folders(moves);
}

fn predecessor_of(identifier: &str) -> Option<&str> {
	identifier.strip_suffix(".app")
}

fn pending_moves(
	home: &Path,
	predecessor: &str,
	identifier: &str,
) -> Vec<(PathBuf, PathBuf)> {
	PER_APP_FOLDERS
		.iter()
		.map(|folder| home.join(folder))
		.map(|folder| (folder.join(predecessor), folder.join(identifier)))
		.filter(|(from, to)| present(from) && !present(to))
		.collect()
}

fn present(path: &Path) -> bool {
	fs::symlink_metadata(path).is_ok()
}

fn move_folders(moves: Vec<(PathBuf, PathBuf)>) {
	for (from, to) in moves {
		if let Err(e) = fs::rename(&from, &to) {
			tracing::warn!("[predecessor] kept {}: {e}", from.display());
		}
	}
}

fn is_running(identifier: &str) -> bool {
	NSRunningApplication::runningApplicationsWithBundleIdentifier(
		&NSString::from_str(identifier),
	)
	.iter()
	.any(|app| !app.isTerminated())
}

fn ask_to_quit() -> ! {
	rfd::MessageDialog::new()
		.set_level(rfd::MessageLevel::Warning)
		.set_title("Quit the older Open Grind")
		.set_description(
			"An older version of Open Grind is still open. Quit it, then open Open Grind again.",
		)
		.set_buttons(rfd::MessageButtons::OkCustom("Quit".to_owned()))
		.show();
	std::process::exit(1);
}

#[cfg(test)]
mod tests {
	use std::sync::atomic::{AtomicUsize, Ordering};

	use super::*;

	struct ScratchHome(PathBuf);

	impl ScratchHome {
		fn new() -> Self {
			static NEXT: AtomicUsize = AtomicUsize::new(0);
			Self(std::env::temp_dir().join(format!(
				"open-grind-predecessor-{}-{}",
				std::process::id(),
				NEXT.fetch_add(1, Ordering::Relaxed)
			)))
		}

		fn folder(&self, root: &str, identifier: &str) -> PathBuf {
			self.0.join(root).join(identifier)
		}

		fn fill(&self, root: &str, identifier: &str) -> PathBuf {
			let folder = self.folder(root, identifier);
			fs::create_dir_all(&folder).unwrap();
			fs::write(folder.join("content"), identifier).unwrap();
			folder
		}
	}

	impl Drop for ScratchHome {
		fn drop(&mut self) {
			fs::remove_dir_all(&self.0).ok();
		}
	}

	#[test]
	fn the_app_identifier_takes_over_the_one_it_was_renamed_from() {
		assert_eq!(predecessor_of("org.opengrind.app"), Some("org.opengrind"));
	}

	#[test]
	fn other_identifiers_take_over_nothing() {
		for identifier in [
			"org.opengrind",
			"org.opengrind.updaterdemo",
			"org.opengrind.apps",
		] {
			assert_eq!(predecessor_of(identifier), None, "{identifier}");
		}
	}

	#[test]
	fn every_per_app_folder_of_the_predecessor_moves() {
		let home = ScratchHome::new();
		for root in PER_APP_FOLDERS {
			home.fill(root, "org.opengrind");
		}

		move_folders(pending_moves(
			&home.0,
			"org.opengrind",
			"org.opengrind.app",
		));

		for root in PER_APP_FOLDERS {
			assert!(!present(&home.folder(root, "org.opengrind")), "{root}");
			assert_eq!(
				fs::read_to_string(
					home.folder(root, "org.opengrind.app").join("content")
				)
				.unwrap(),
				"org.opengrind",
				"{root}"
			);
		}
	}

	#[test]
	fn a_folder_the_app_already_has_keeps_both_sides_untouched() {
		let home = ScratchHome::new();
		let theirs = home.fill("Library/WebKit", "org.opengrind");
		let ours = home.fill("Library/WebKit", "org.opengrind.app");

		move_folders(pending_moves(
			&home.0,
			"org.opengrind",
			"org.opengrind.app",
		));

		assert_eq!(
			fs::read_to_string(theirs.join("content")).unwrap(),
			"org.opengrind"
		);
		assert_eq!(
			fs::read_to_string(ours.join("content")).unwrap(),
			"org.opengrind.app"
		);
	}

	#[test]
	fn identifiers_sharing_the_prefix_stay_where_they_are() {
		let home = ScratchHome::new();
		home.fill("Library/Application Support", "org.opengrind.devtool");
		home.fill("Library/Application Support", "org.opengrind.updaterdemo");

		assert!(pending_moves(&home.0, "org.opengrind", "org.opengrind.app")
			.is_empty());
	}
}
