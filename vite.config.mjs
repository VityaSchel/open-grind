import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchForWorkspaceRoot } from "vite";
import { defineConfig } from "vitest/config";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const root = path.dirname(fileURLToPath(import.meta.url));
const projectVersion = JSON.parse(
	readFileSync(path.join(root, "package.json"), "utf-8"),
).version;
const cargoMetadata = JSON.parse(
	execSync("cargo metadata --format-version 1", {
		cwd: path.join(root, "src-tauri"),
		maxBuffer: 16 * 1024 * 1024,
	}),
);
const grindrManifest = cargoMetadata.packages.find(
	(p) => p.name === "grindr",
)?.manifest_path;
if (!grindrManifest)
	throw new Error("grindr crate not found in cargo metadata");
const headersRs = readFileSync(
	path.join(path.dirname(grindrManifest), "src", "headers.rs"),
	"utf-8",
);
function scrapeHeaderConst(name) {
	const match = headersRs.match(
		new RegExp(`const ${name}: &str = "([^"]+)";`),
	);
	if (!match)
		throw new Error(`${name} not found in the grindr crate headers`);
	return match[1];
}
const grindrApiVersion = scrapeHeaderConst("APP_VERSION");
const grindrApiBuildNumber = scrapeHeaderConst("BUILD_NUMBER");
const versionName = `OpenGrind/${projectVersion}\ngrindr3/${grindrApiVersion};${grindrApiBuildNumber}`;

// https://vite.dev/config/
export default defineConfig(async ({ command }) => ({
	plugins: [
		sveltekit({
			preprocess: vitePreprocess(),
			compilerOptions: { experimental: { async: true } },
			adapter: adapter({ fallback: "index.html" }),
			version: { name: versionName },
		}),
		tailwindcss(),
	],
	resolve: {
		alias: { $layout: path.join(root, "src/layout.css") },
		...(process.env.VITEST ? { conditions: ["browser"] } : {}),
	},

	// OPEN_GRIND_STORE already selects the Android manifest overlay; exposing it
	// here lets the bundle drop what a store build may not carry.
	envPrefix: ["VITE_", "OPEN_GRIND_"],

	esbuild: { drop: command === "build" ? ["console", "debugger"] : [] },

	optimizeDeps: { include: ["leaflet", "sveaflet"] },

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent Vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
		fs: {
			allow: [
				searchForWorkspaceRoot(process.cwd()),
				realpathSync("node_modules"),
			],
		},
	},

	test: {
		environment: "jsdom",
		include: [
			"src/**/*.test.ts",
			"e2e-live/support/**/*.test.ts",
			"scripts/credits/**/*.test.ts",
		],
		setupFiles: ["src/test-setup.ts"],
		// tinykeys caches navigator.platform at load, so vi.resetModules() cannot
		// re-resolve `$mod` unless tinykeys goes through the module runner too.
		server: { deps: { inline: ["tinykeys"] } },
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			include: ["src/**/*.{ts,svelte}"],
		},
	},
}));
