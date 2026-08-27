use std::fs;
use std::path::Path;
use std::process::Command;

use crate::api::update::error::UpdateError;

pub fn install(payload: &Path) -> Result<(), UpdateError> {
	let runnable = payload.with_extension("exe");
	fs::copy(payload, &runnable)?;
	// Under /S the installer kills the running app itself instead of prompting,
	// /UPDATE skips the WebView2 and uninstall-first steps, /R relaunches it:
	// https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/windows/templates/utils.nsh
	Command::new(&runnable)
		.args(["/S", "/UPDATE", "/R"])
		.spawn()
		.map_err(|e| UpdateError::Install(e.to_string()))?;
	Ok(())
}
