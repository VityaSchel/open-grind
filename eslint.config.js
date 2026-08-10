import { sveltekit } from "@opengrind/config/eslint/svelte";
import { defineConfig } from "eslint/config";

import svelteConfig from "./svelte.config.js";

const tailwindEntry = "src/layout.css";

export default defineConfig(
	...sveltekit({
		svelteConfig,
		tailwindEntry,
		vendoredGlob: "src/lib/components/ui/**",
		ignores: [
			"src-tauri/",
			"reverse/",
			"docs/",
			"contrib/",
			"static/",
			"scripts/",
		],
	}),
	{
		files: ["src/routes/**/*.svelte"],
		settings: {
			"better-tailwindcss": {
				entryPoint: tailwindEntry,
				attributes: [
					[
						"^class$",
						[{ match: "strings" }, { match: "objectKeys" }],
					],
				],
			},
		},
	},
);
