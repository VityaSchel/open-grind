import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import perfectionist from "eslint-plugin-perfectionist";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import globals from "globals";
import ts from "typescript-eslint";

import svelteConfig from "./svelte.config.js";

export default defineConfig(
	js.configs.recommended,
	...ts.configs.recommendedTypeChecked,
	prettier,
	svelte.configs.prettier,
	{
		plugins: {
			perfectionist,
		},
		languageOptions: {
			globals: globals.node,
			parserOptions: {
				projectService: true,
			},
		},
		rules: {
			"no-undef": "off",
			"@typescript-eslint/require-array-sort-compare": [
				"error",
				{ ignoreStringArrays: true },
			],
			"perfectionist/sort-imports": [
				"error",
				{
					internalPattern: ["^\\$lib/"],
					newlinesBetween: 0,
					groups: [
						["value-external", "value-builtin"],
						["type-external", "type-builtin"],
						{ newlinesBetween: 1 },
						"value-internal",
						"type-internal",
						[
							"value-parent",
							"value-sibling",
							"value-index",
							"type-parent",
							"type-sibling",
							"type-index",
						],
						"ts-equals-import",
						"unknown",
					],
				},
			],
			"perfectionist/sort-named-imports": "error",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
		},
	},
	{
		files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: [".svelte"],
				parser: ts.parser,
				svelteConfig,
			},
		},
		rules: {
			"@typescript-eslint/require-array-sort-compare": [
				"error",
				{ ignoreStringArrays: true },
			],
		},
	},
	{
		files: ["src/routes/**/*.svelte"],
		plugins: {
			"better-tailwindcss": betterTailwindcss,
		},
		settings: {
			"better-tailwindcss": {
				entryPoint: "src/layout.css",
			},
		},
		rules: {
			"better-tailwindcss/no-restricted-classes": [
				"warn",
				{
					restrict: [
						{
							pattern: "-\\[[0-9.]+(px|rem|em)\\]",
							message:
								"Raw dimensional value in a route — promote it to a semantic token in src/layout.css (@theme).",
						},
						{
							pattern: "\\[&",
							message:
								"Child-selector styling belongs in a component (src/lib), not a page.",
						},
						{
							pattern: "\\[#",
							message: "Hardcoded color — use a semantic color token.",
						},
					],
				},
			],
		},
	},
	{
		files: ["**/*.config.{js,ts,mjs,cjs}", "*.config.{js,ts,mjs,cjs}"],
		...ts.configs.disableTypeChecked,
	},
);
