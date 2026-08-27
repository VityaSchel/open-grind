export const MACOS_TARGET = "universal-apple-darwin";

export const macosBundle = (root: string, profile: string) =>
	`${root}/src-tauri/target/${MACOS_TARGET}/${profile}/bundle/macos`;
