use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const CONTAINER_DIRS: [&str; 7] = [
	"Documents",
	"Library/Cookies",
	"Library/HTTPStorages",
	"Library/Preferences",
	"Library/Saved Application State",
	"Library/SplashBoard",
	"Library/WebKit",
];

struct Exclusion<'a, M> {
	home: &'a Path,
	app_data: &'a Path,
	mark: M,
}

fn exclude_each<M: Fn(&Path) -> io::Result<()>>(
	Exclusion {
		home,
		app_data,
		mark,
	}: Exclusion<'_, M>,
) -> Vec<(PathBuf, io::Error)> {
	std::iter::once(app_data.to_path_buf())
		.chain(CONTAINER_DIRS.iter().map(|dir| home.join(dir)))
		.filter_map(|dir| {
			fs::create_dir_all(&dir)
				.and_then(|()| mark(&dir))
				.err()
				.map(|error| (dir, error))
		})
		.collect()
}

#[cfg(target_os = "ios")]
pub fn exclude_from_backups<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
	use tauri::Manager;

	let paths = app.path();
	let (home, app_data) = match (paths.home_dir(), paths.app_local_data_dir())
	{
		(Ok(home), Ok(app_data)) => (home, app_data),
		(Err(error), _) | (_, Err(error)) => {
			tracing::warn!(
				"[backup] could not find the app container: {error}"
			);
			return;
		}
	};
	for (dir, error) in exclude_each(Exclusion {
		home: &home,
		app_data: &app_data,
		mark: ios::exclude,
	}) {
		tracing::warn!(
			"[backup] could not exclude {} from backups: {error}",
			dir.display()
		);
	}
}

#[cfg(target_os = "ios")]
mod ios {
	use std::io;
	use std::path::Path;

	use objc2_foundation::{NSNumber, NSURLIsExcludedFromBackupKey, NSURL};

	pub(super) fn exclude(dir: &Path) -> io::Result<()> {
		let url = NSURL::from_directory_path(dir).ok_or_else(|| {
			io::Error::new(io::ErrorKind::InvalidInput, "not a file URL")
		})?;
		let excluded = NSNumber::new_bool(true);
		unsafe {
			url.setResourceValue_forKey_error(
				Some(&excluded),
				NSURLIsExcludedFromBackupKey,
			)
		}
		.map_err(|error| {
			io::Error::other(error.localizedDescription().to_string())
		})
	}
}

#[cfg(test)]
mod tests {
	use std::cell::RefCell;

	use super::*;
	use crate::scratch_dir::ScratchDir;

	const APP_DATA: &str = "Library/Application Support/org.opengrind.app";

	#[test]
	fn the_app_data_and_every_store_ios_backs_up_are_created_and_then_marked() {
		let home = ScratchDir::new();
		let marked = RefCell::new(Vec::new());

		let failures = exclude_each(Exclusion {
			home: &home,
			app_data: &home.join(APP_DATA),
			mark: |dir: &Path| {
				assert!(
					dir.is_dir(),
					"{} was marked before it existed",
					dir.display()
				);
				marked.borrow_mut().push(dir.to_path_buf());
				Ok(())
			},
		});

		assert!(failures.is_empty());
		let marked = marked.into_inner();
		for expected in [
			APP_DATA,
			"Library/WebKit",
			"Library/Cookies",
			"Library/HTTPStorages",
			"Library/Preferences",
			"Library/Saved Application State",
			"Library/SplashBoard",
			"Documents",
		] {
			assert!(
				marked.contains(&home.join(expected)),
				"{expected} would still go into backups"
			);
		}
	}

	#[test]
	fn one_refused_store_does_not_leave_the_others_in_backups() {
		let home = ScratchDir::new();
		let refused = home.join("Library/Cookies");
		let marked = RefCell::new(Vec::new());

		let failures = exclude_each(Exclusion {
			home: &home,
			app_data: &home.join(APP_DATA),
			mark: |dir: &Path| {
				if dir == refused {
					return Err(io::Error::other("refused"));
				}
				marked.borrow_mut().push(dir.to_path_buf());
				Ok(())
			},
		});

		assert_eq!(failures.len(), 1);
		assert_eq!(failures[0].0, refused);
		let marked = marked.into_inner();
		assert_eq!(marked.len(), 7);
		assert!(!marked.contains(&refused));
	}
}
