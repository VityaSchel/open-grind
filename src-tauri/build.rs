use std::process::Command;

const EXTENSION_SOURCE: &str = "webkit-extension/ogmedia.c";
const EXTENSION_OUTPUT: &str = "gen/webkit-extensions/libogmedia.so";
const EXTENSION_LIBRARIES: [&str; 4] = [
	"webkit2gtk-web-extension-4.1",
	"gstreamer-1.0",
	"gstreamer-base-1.0",
	"gio-unix-2.0",
];

fn main() {
	declare_demo_build();
	if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
		build_webkit_extension();
	}
	tauri_build::build()
}

fn declare_demo_build() {
	println!("cargo:rustc-check-cfg=cfg(demo)");
	println!("cargo:rerun-if-env-changed=OPEN_GRIND_DEMO");
	if std::env::var("OPEN_GRIND_DEMO").as_deref() == Ok("1") {
		println!("cargo:rustc-cfg=demo");
	}
}

fn build_webkit_extension() {
	println!("cargo:rerun-if-changed={EXTENSION_SOURCE}");
	let pkg_config =
		std::env::var("PKG_CONFIG").unwrap_or_else(|_| "pkg-config".to_owned());
	let flags = Command::new(pkg_config)
		.args(["--cflags", "--libs"])
		.args(EXTENSION_LIBRARIES)
		.output()
		.expect("run pkg-config");
	assert!(
		flags.status.success(),
		"pkg-config cannot find {EXTENSION_LIBRARIES:?}: {}",
		String::from_utf8_lossy(&flags.stderr)
	);
	std::fs::create_dir_all("gen/webkit-extensions")
		.expect("create gen/webkit-extensions");
	let status = cc::Build::new()
		.debug(false)
		.get_compiler()
		.to_command()
		.args([
			"-shared",
			"-fPIC",
			"-O2",
			"-Wall",
			"-o",
			EXTENSION_OUTPUT,
			EXTENSION_SOURCE,
		])
		.args(String::from_utf8_lossy(&flags.stdout).split_whitespace())
		.status()
		.expect("run the C compiler");
	assert!(status.success(), "compiling {EXTENSION_SOURCE} failed");
}
