// A function, because clippy is crate-wide and takes no file list
export default {
	"*.{js,mjs,ts,svelte}": [
		"prettier --write",
		"eslint --fix --no-warn-ignored",
	],
	"*.{json,md,yml,yaml,css,html}": "prettier --write",
	"*.rs": (files) => [
		`rustfmt --edition 2021 ${files.map((f) => JSON.stringify(f)).join(" ")}`,
		// Errors only, like eslint: tasks see staged content, so -D warnings would
		// block a partial commit over warnings a later commit fixes
		"cargo clippy --manifest-path src-tauri/Cargo.toml --lib --all-targets",
	],
};
