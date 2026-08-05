import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import perfectionist from "eslint-plugin-perfectionist";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import globals from "globals";
import path from "node:path";
import ts from "typescript-eslint";

import svelteConfig from "./svelte.config.js";

const progress = {
	rules: {
		file: {
			create(context) {
				if (process.env.ESLINT_PROGRESS)
					process.stderr.write(
						`  lint ${path.relative(context.cwd, context.filename)}\n`,
					);
				return {};
			},
		},
	},
};

export default defineConfig(
	{
		ignores: [
			"build/",
			".svelte-kit/",
			"src-tauri/",
			"reverse/",
			"docs/",
			"contrib/",
			"coverage/",
			"static/",
			"scripts/",
			"test-results/",
			"playwright-report/",
		],
	},
	js.configs.recommended,
	...ts.configs.recommendedTypeChecked,
	prettier,
	svelte.configs.prettier,
	{
		plugins: { perfectionist, progress },
		linterOptions: { reportUnusedDisableDirectives: "error" },
		languageOptions: {
			globals: globals.node,
			parserOptions: { projectService: true },
		},
		rules: {
			"progress/file": "warn",
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
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-redundant-type-constituents": "off",
			eqeqeq: ["error", "always"],
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{
					prefer: "type-imports",
					fixStyle: "separate-type-imports",
					disallowTypeAnnotations: false,
				},
			],
			"max-lines": [
				"error",
				{ max: 600, skipBlankLines: true, skipComments: true },
			],
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
			"svelte/prefer-style-directive": "error",
			"svelte/no-useless-mustaches": "error",
			"svelte/html-self-closing": "error",
			"svelte/prefer-const": ["error", { excludedRunes: ["$props", "$state"] }],
		},
	},
	{
		files: ["**/*.svelte"],
		rules: {
			"svelte/max-lines-per-block": ["error", { script: 300, template: 300 }],
		},
	},
	{
		files: ["**/*.svelte"],
		ignores: ["src/lib/components/ui/**"],
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					selector: `SvelteAttribute[key.name="class"] :matches(ArrayExpression, CallExpression[callee.name="cn"]) > :matches(LogicalExpression[operator="&&"], ConditionalExpression)`,
					message: `Conditional classes go in the object: class={["base", { "cls": cond }]}`,
				},
				{
					selector: `SvelteAttribute[key.name="class"][value.length=1] > SvelteMustacheTag > :matches(LogicalExpression[operator="&&"], ConditionalExpression)`,
					message: `Use class={{ "cls": cond }} instead of a bare ternary or &&`,
				},
				{
					selector: `SvelteStyleDirective LogicalExpression[operator="&&"]`,
					message: `style:x={a && b} never clears the property when a is false — use a ? b : undefined`,
				},
				{
					selector: `SvelteDirective[kind="Class"]`,
					message: `Use the class attribute array/object form, not the class: directive`,
				},
			],
		},
	},
	{
		files: ["src/routes/**/*.svelte"],
		plugins: { "better-tailwindcss": betterTailwindcss },
		settings: { "better-tailwindcss": { entryPoint: "src/layout.css" } },
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
