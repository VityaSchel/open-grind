// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectVersion = JSON.parse(
	fs.readFileSync(
		path.join(path.dirname(fileURLToPath(import.meta.url)), "./package.json"),
		"utf-8",
	),
).version;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cargoMetadata = JSON.parse(
	execSync("cargo metadata --format-version 1", {
		cwd: path.join(__dirname, "src-tauri"),
		maxBuffer: 16 * 1024 * 1024,
	}),
);
const grindrManifest = cargoMetadata.packages.find(
	(p) => p.name === "grindr",
)?.manifest_path;
if (!grindrManifest)
	throw new Error("grindr crate not found in cargo metadata");
const headersRs = fs.readFileSync(
	path.join(path.dirname(grindrManifest), "src", "headers.rs"),
	"utf-8",
);
const grindrApiVersion = headersRs.match(
	/const APP_VERSION: &str = "([^"]+)";/,
)[1];
const grindrApiBuildNumber = headersRs.match(
	/const BUILD_NUMBER: &str = "([^"]+)";/,
)[1];

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		experimental: {
			async: true,
		},
	},
	kit: {
		adapter: adapter({
			fallback: "index.html",
		}),
		alias: {
			$layout: "src/layout.css",
		},
		version: {
			name: `OpenGrind/${projectVersion}\ngrindr3/${grindrApiVersion};${grindrApiBuildNumber}`,
		},
	},
};

export default config;
