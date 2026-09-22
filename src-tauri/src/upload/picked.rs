use std::fs::File;
use std::io;
use std::path::PathBuf;

use serde::Deserialize;
use tauri::Runtime;
use tauri_plugin_fs::FsExt;

const CONTENT_SCHEME: &str = "content://";

const OUTSIDE_SCOPE: &str =
	"That file is outside the folders this app may read";
#[cfg(not(target_os = "android"))]
const NOT_ANDROID: &str = "Android file URIs can only be opened on Android";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidUri {
	pub uri: String,
	#[cfg_attr(not(target_os = "android"), allow(dead_code))]
	pub document_top_tree_uri: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "source", rename_all = "lowercase")]
pub enum PickedFile {
	Android { uri: AndroidUri },
	Desktop { path: PathBuf },
}

impl PickedFile {
	pub fn open<R: Runtime>(
		&self,
		app: &tauri::AppHandle<R>,
	) -> io::Result<File> {
		match self {
			PickedFile::Desktop { path } => {
				let allowed = app
					.try_fs_scope()
					.is_some_and(|scope| scope.is_allowed(path));
				if !allowed {
					return Err(io::Error::new(
						io::ErrorKind::PermissionDenied,
						OUTSIDE_SCOPE,
					));
				}
				File::open(path)
			}
			PickedFile::Android { uri } => {
				if !uri.uri.starts_with(CONTENT_SCHEME) {
					return Err(io::Error::new(
						io::ErrorKind::PermissionDenied,
						OUTSIDE_SCOPE,
					));
				}
				open_android(app, uri)
			}
		}
	}
}

#[cfg(target_os = "android")]
fn open_android<R: Runtime>(
	app: &tauri::AppHandle<R>,
	uri: &AndroidUri,
) -> io::Result<File> {
	use tauri_plugin_android_fs::{AndroidFsExt, FileUri};
	let uri = FileUri {
		uri: uri.uri.clone(),
		document_top_tree_uri: uri.document_top_tree_uri.clone(),
	};
	app.android_fs()
		.open_file_readable(&uri)
		.map_err(|error| io::Error::other(error.to_string()))
}

#[cfg(not(target_os = "android"))]
fn open_android<R: Runtime>(
	_app: &tauri::AppHandle<R>,
	_uri: &AndroidUri,
) -> io::Result<File> {
	Err(io::Error::new(io::ErrorKind::Unsupported, NOT_ANDROID))
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::upload::test_support::{app, TempFile};

	#[test]
	fn a_desktop_path_outside_the_scope_is_refused() {
		let app = app();
		let temp = TempFile::new("outside.jpg", b"\xFF\xD8\xFF");
		let path = temp.path().to_path_buf();
		let picked = PickedFile::Desktop { path: path.clone() };

		let refused = picked.open(app.handle()).expect_err("refused");

		assert_eq!(refused.kind(), io::ErrorKind::PermissionDenied);
		assert_eq!(refused.to_string(), OUTSIDE_SCOPE);
	}

	#[test]
	fn an_android_uri_outside_the_content_provider_is_refused() {
		let app = app();
		let picked = PickedFile::Android {
			uri: AndroidUri {
				uri: "file:///data/data/org.opengrind/credentials".to_owned(),
				document_top_tree_uri: None,
			},
		};

		let refused = picked.open(app.handle()).expect_err("refused");

		assert_eq!(refused.kind(), io::ErrorKind::PermissionDenied);
		assert_eq!(refused.to_string(), OUTSIDE_SCOPE);
	}

	#[test]
	fn an_android_uri_is_refused_off_android() {
		let app = app();
		let picked = PickedFile::Android {
			uri: AndroidUri {
				uri: "content://media/external/images/media/1".to_owned(),
				document_top_tree_uri: None,
			},
		};

		let refused = picked.open(app.handle()).expect_err("refused");

		assert_eq!(refused.kind(), io::ErrorKind::Unsupported);
	}

	#[test]
	fn the_descriptor_matches_the_frontend_shape() {
		let desktop: PickedFile = serde_json::from_str(
			r#"{"source":"desktop","key":"k","mimeType":null,"path":"/tmp/a.jpg"}"#,
		)
		.expect("desktop");
		assert!(
			matches!(desktop, PickedFile::Desktop { path } if path == std::path::Path::new("/tmp/a.jpg"))
		);

		let android: PickedFile = serde_json::from_str(
			r#"{"source":"android","key":"k","mimeType":"video/mp4","uri":{"uri":"content://x","documentTopTreeUri":null}}"#,
		)
		.expect("android");
		assert!(
			matches!(android, PickedFile::Android { uri } if uri.uri == "content://x")
		);

		assert!(serde_json::from_str::<PickedFile>(
			r#"{"source":"web","key":"k","mimeType":null}"#
		)
		.is_err());
	}
}
