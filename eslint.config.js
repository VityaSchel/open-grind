import {
	conditionalClassSelectors,
	sveltekit,
} from "@opengrind/config/eslint/svelte";
import { defineConfig } from "eslint/config";

import svelteConfig from "./svelte.config.js";

const vendoredGlob = "src/lib/components/ui/**";

const translatedSvelteFiles = [
	"src/routes/+error.svelte",
	"src/lib/components/feedback/ApiErrorDisplay.svelte",
	"src/lib/components/feedback/RequestBlockedAlert.svelte",
	"src/lib/components/filters/OptionFilter.svelte",
	"src/routes/(protected)/(navbar)/profile/[[]profileId]/fields/LastTested.svelte",
	"src/routes/(protected)/(navbar)/profile/[[]profileId]/fields/LookupField.svelte",
	"src/routes/(protected)/(navbar)/profile/[[]profileId]/HeightWeightBodyType.svelte",
	"src/routes/(protected)/(navbar)/profile/[[]profileId]/SexualPosition.svelte",
	"src/routes/(protected)/chat/[[]conversationId]/messages/message/MessageDateGroup.svelte",
];

const translatedScriptFiles = [
	"src/lib/api/api-error.ts",
	"src/lib/api/error-copy.ts",
	"src/lib/api/error-toast.ts",
	"src/lib/api/methods.ts",
	"src/lib/components/filters/distance/distance-steps.ts",
	"src/lib/model/browse/grid/filters.ts",
	"src/lib/model/users/profiles.ts",
	"src/lib/util/format-time.ts",
	"src/lib/util/units.ts",
	"src/routes/(protected)/(navbar)/settings/(subpage)/albums/album-editor/album-updated-label.ts",
	"src/routes/(protected)/(navbar)/settings/(subpage)/profile/options.ts",
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

const translationCall = `CallExpression[callee.name=/^(?:t|richParts)$/]`;
const eagerTranslationCall = `${translationCall}:not(:matches(:function, ClassBody, CallExpression[callee.name="$derived"]) *)`;
const topLevelInitializer = (root) =>
	`:matches(${root} > VariableDeclaration, ${root} > ExportNamedDeclaration > VariableDeclaration) > VariableDeclarator`;

const scriptStaleTextSelectors = [
	{
		selector: `${topLevelInitializer("Program")} ${eagerTranslationCall}`,
		message: "Call t() inside a function so the text follows the locale",
	},
];

const svelteStaleTextSelectors = [
	{
		selector: `${topLevelInitializer("SvelteScriptElement")} ${eagerTranslationCall}`,
		message:
			"Wrap t() in $derived or a function so the text follows the locale",
	},
	{
		selector: `SvelteMustacheTag[kind="raw"] ${translationCall}`,
		message: "Render translations as text or with Rich.svelte, not {@html}",
	},
];

export default defineConfig(
	...sveltekit({
		svelteConfig,
		tailwindEntry: "src/layout.css",
		vendoredGlob,
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
		files: ["src/**/*.ts"],
		rules: {
			"no-restricted-syntax": ["error", ...scriptStaleTextSelectors],
		},
	},
	{
		files: [`${vendoredGlob}/*.svelte`],
		rules: {
			"no-restricted-syntax": ["error", ...svelteStaleTextSelectors],
		},
	},
	{
		files: ["src/**/*.svelte"],
		ignores: [vendoredGlob],
		rules: {
			"no-restricted-syntax": [
				"error",
				...conditionalClassSelectors,
				...svelteStaleTextSelectors,
			],
		},
	},
	{
		files: translatedSvelteFiles,
		rules: {
			"no-restricted-syntax": [
				"error",
				...conditionalClassSelectors,
				...svelteRawTextSelectors,
				...scriptRawTextSelectors,
				...svelteStaleTextSelectors,
			],
		},
	},
	{
		files: translatedScriptFiles,
		rules: {
			"no-restricted-syntax": [
				"error",
				...scriptRawTextSelectors,
				...scriptStaleTextSelectors,
			],
		},
	},
);
