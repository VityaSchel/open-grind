import { sveltekit } from "@opengrind/config/eslint/svelte";
import { defineConfig } from "eslint/config";

import svelteConfig from "./svelte.config.js";

export default defineConfig(
	...sveltekit({
		svelteConfig,
		tailwindEntry: "src/layout.css",
		vendoredGlob: "src/lib/components/ui/**",
		ignores: [
			"src-tauri/",
			"reverse/",
			"docs/",
			"contrib/",
			"static/",
			"scripts/",
			"ci/",
			"e2e/updater/",
		],
	}),
);
