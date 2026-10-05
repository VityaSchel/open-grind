import {
	conditionalClassSelectors,
	sveltekit,
} from "@opengrind/config/eslint/svelte";
import { defineConfig } from "eslint/config";

import svelteConfig from "./svelte.config.js";

const translatedSvelteFiles = [
	"src/routes/+error.svelte",
	"src/lib/components/feedback/RequestBlockedAlert.svelte",
];

const translatedScriptFiles = [
	"src/lib/api/error-copy.ts",
	"src/lib/api/error-toast.ts",
	"src/lib/util/format-time.ts",
];

const letter = String.raw`/\p{L}/u`;
const literalText = `:matches(Literal[value=${letter}], TemplateLiteral:has(> TemplateElement[value.cooked=${letter}]))`;
const toastCall = `CallExpression:matches([callee.name="toast"], [callee.object.name="toast"][callee.property.name!="dismiss"])`;
const textAttribute = `SvelteAttribute[key.name=/^(?:aria-label|aria-description|alt|title|placeholder)$/]`;

const rawText = (selectors) =>
	selectors.map((selector) => ({
		selector,
		message: "Render interface text through t() from $lib/i18n",
	}));

const scriptRawTextSelectors = rawText([
	`${toastCall} > ${literalText}`,
	`${toastCall} > ObjectExpression Property[key.name=/^(?:description|label)$/] > ${literalText}`,
	`CallExpression[callee.name="showErrorToast"] > ObjectExpression > Property[key.name="label"] > ${literalText}`,
]);

const svelteRawTextSelectors = rawText([
	`SvelteText[value=${letter}]`,
	`${textAttribute} > SvelteLiteral[value=${letter}]`,
	`${textAttribute} > SvelteMustacheTag > ${literalText}`,
]);

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
			"src/lib/i18n/generated.ts",
		],
	}),
	{
		files: translatedSvelteFiles,
		rules: {
			"no-restricted-syntax": [
				"error",
				...conditionalClassSelectors,
				...svelteRawTextSelectors,
				...scriptRawTextSelectors,
			],
		},
	},
	{
		files: translatedScriptFiles,
		rules: { "no-restricted-syntax": ["error", ...scriptRawTextSelectors] },
	},
);
