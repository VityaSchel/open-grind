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

pub struct Container<'a> {
	pub home: &'a Path,
	pub app_data: &'a Path,
}

pub fn backed_up_dirs(
	Container { home, app_data }: Container<'_>,
) -> Vec<PathBuf> {
	std::iter::once(app_data.to_path_buf())
		.chain(CONTAINER_DIRS.iter().map(|dir| home.join(dir)))
		.collect()
}

pub struct Exclusion<'a, M> {
	pub dirs: &'a [PathBuf],
	pub mark: M,
}

pub fn exclude_each<M: Fn(&Path) -> io::Result<()>>(
	Exclusion { dirs, mark }: Exclusion<'_, M>,
) -> Vec<(PathBuf, io::Error)> {
	dirs.iter()
		.filter_map(|dir| {
			fs::create_dir_all(dir)
				.and_then(|()| mark(dir))
				.err()
				.map(|error| (dir.clone(), error))
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
	let dirs = backed_up_dirs(Container {
		home: &home,
		app_data: &app_data,
	});
	for (dir, error) in exclude_each(Exclusion {
		dirs: &dirs,
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
	use std::sync::atomic::{AtomicUsize, Ordering};

	use super::*;

	struct ScratchHome(PathBuf);

	impl ScratchHome {
		fn new() -> Self {
			static NEXT: AtomicUsize = AtomicUsize::new(0);
			Self(std::env::temp_dir().join(format!(
				"open-grind-backup-{}-{}",
				std::process::id(),
				NEXT.fetch_add(1, Ordering::Relaxed)
			)))
		}

		fn path(&self) -> &Path {
			&self.0
		}
	}

	impl Drop for ScratchHome {
		fn drop(&mut self) {
			fs::remove_dir_all(&self.0).ok();
		}
	}

	#[test]
	fn the_app_data_and_every_store_ios_backs_up_are_excluded() {
		let dirs = backed_up_dirs(Container {
			home: Path::new("/container"),
			app_data: Path::new(
				"/container/Library/Application Support/org.opengrind.app",
			),
		});

		for expected in [
			"/container/Library/Application Support/org.opengrind.app",
			"/container/Library/WebKit",
			"/container/Library/Cookies",
			"/container/Library/HTTPStorages",
			"/container/Library/Preferences",
			"/container/Library/Saved Application State",
			"/container/Library/SplashBoard",
			"/container/Documents",
		] {
			assert!(
				dirs.contains(&PathBuf::from(expected)),
				"{expected} would still go into backups"
			);
		}
	}

	#[test]
	fn a_store_webkit_has_not_created_yet_is_created_and_then_marked() {
		let home = ScratchHome::new();
		let dirs = vec![
			home.path().join("Library/WebKit"),
			home.path().join("Library/HTTPStorages"),
		];
		let marked = RefCell::new(Vec::new());

		let failures = exclude_each(Exclusion {
			dirs: &dirs,
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
		assert_eq!(marked.into_inner(), dirs);
	}

	#[test]
	fn one_refused_store_does_not_leave_the_others_in_backups() {
		let home = ScratchHome::new();
		let dirs = vec![
			home.path().join("Library/Cookies"),
			home.path().join("Library/WebKit"),
		];
		let marked = RefCell::new(Vec::new());

		let failures = exclude_each(Exclusion {
			dirs: &dirs,
			mark: |dir: &Path| {
				if dir.ends_with("Cookies") {
					return Err(io::Error::other("refused"));
				}
				marked.borrow_mut().push(dir.to_path_buf());
				Ok(())
			},
		});

		assert_eq!(failures.len(), 1);
		assert_eq!(failures[0].0, dirs[0]);
		assert_eq!(marked.into_inner(), vec![dirs[1].clone()]);
	}
}
