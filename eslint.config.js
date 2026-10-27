import { sveltekit } from "@opengrind/config/eslint/svelte";
import { loadConfig } from "@sveltejs/load-config";
import { defineConfig } from "eslint/config";

const loaded = await loadConfig(import.meta.dirname, { traverse: false });
if (!loaded || "error" in loaded)
	throw new Error("Could not load the Svelte config from vite.config.mjs", {
		cause: loaded?.error,
	});

export default defineConfig(
	...sveltekit({
		svelteConfig: { compilerOptions: loaded.config.compilerOptions },
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
	{
		rules: {
			"@typescript-eslint/no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "phosphor-svelte",
							allowTypeImports: true,
							message:
								'Import each icon from "phosphor-svelte/lib/<Name>".',
						},
					],
				},
			],
		},
	},
);
