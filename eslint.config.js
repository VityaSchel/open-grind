import {
	conditionalClassSelectors,
	sveltekit,
} from "@opengrind/config/eslint/svelte";
import { defineConfig } from "eslint/config";

import svelteConfig from "./svelte.config.js";

const vendoredGlob = "src/lib/components/ui/**";

const testFiles = [
	"src/**/*.test.ts",
	"src/**/*-test-helpers.ts",
	"src/**/*-test-helpers.svelte.ts",
	"src/lib/i18n/fixtures/**",
];

const untranslatedData = [
	"src/lib/chat/gaymoji-sections.ts",
	"src/lib/demo/mock/**",
	"src/lib/i18n/language-names.ts",
	"src/lib/i18n/matcher.ts",
];

const englishDiagnostics = [
	"src/lib/api/error-report.ts",
	"src/lib/api/redact/*.ts",
	"src/lib/api/transport.ts",
	"src/lib/platform/media-failure.ts",
	"src/lib/push/explained-error.ts",
];

const rawTextExemptions = [
	vendoredGlob,
	...testFiles,
	...untranslatedData,
	...englishDiagnostics,
];

const brands = [
	"Open Grind",
	"Grindr",
	"Google",
	"Facebook",
	"Instagram",
	"Android",
	"Linux",
	"macOS",
	"Windows",
	"Bits UI",
	"Svelte",
	"Sveaflet",
	"Tailwind CSS",
	"Tauri",
	"Zod",
];

const letter = String.raw`/\p{L}/u`;
const brandOnly = String.raw`/^\s*(?:${brands.join("|")})\s*$/u`;
const capitalized = String.raw`/^[^\p{L}]*\p{Lu}/u`;
const identifier = String.raw`/^(?:[\p{Lu}\d_]+|\p{Lu}[\p{L}\d]*\p{Ll}\p{Lu}[\p{L}\d]*)$/u`;
const letterless = String.raw`/^[^\p{L}]*$/u`;
const spacedWord = String.raw`/\s\p{L}/u`;
const literalText = `:matches(Literal[value=${letter}], TemplateLiteral:has(> TemplateElement[value.cooked=${letter}]))`;
const proseValue = `[value=${capitalized}]:not([value=${identifier}], [value=${brandOnly}])`;
const proseLiteral = `Literal${proseValue}`;
const proseTemplate = `TemplateLiteral:matches(:has(> TemplateElement:first-child[value.cooked=${capitalized}]), :has(> TemplateElement:first-child[value.cooked=${letterless}]):has(> TemplateElement[value.cooked=${spacedWord}]))`;
const diagnosticCall = `:matches(CallExpression[callee.object.name="console"], CallExpression[callee.name="writeText"], CallExpression[callee.property.name="writeText"], NewExpression[callee.name=/Error$/], ClassDeclaration[superClass.name=/Error$/] CallExpression[callee.type="Super"])`;
const identityProperty = `Property[key.name=/^(?:kind|type)$/]`;
const identityValue = `${identityProperty} > :not(ObjectExpression, ArrayExpression)`;
const proseText = `:matches(${proseLiteral}, ${proseTemplate}):not(${diagnosticCall} *, ${identityValue} *)`;
const toastCall = `CallExpression:matches([callee.name="toast"], [callee.object.name="toast"][callee.property.name!="dismiss"])`;
const toastTextProperty = `:matches(${toastCall} > ObjectExpression Property[key.name=/^(?:description|label)$/], CallExpression[callee.name="showErrorToast"] > ObjectExpression > Property[key.name="label"])`;
const fallbackOperator = `LogicalExpression:matches([operator="??"], [operator="||"]):not(BinaryExpression[operator=/^[!=]==?$/] > *)`;
const textAttribute = `SvelteAttribute[key.name=/^(?:aria-label|aria-description|aria-roledescription|alt|title|placeholder)$/]`;
const schemaCall = `CallExpression:matches([callee.object.name="z"], [callee.property.name="catch"])`;
const lookupCall = `CallExpression[callee.property.name=/^(?:get|getAll|has)$/]`;
const componentAttribute = `SvelteElement[kind="component"] > SvelteStartTag > SvelteAttribute:not(${textAttribute})`;

const rawText = (selectors) =>
	selectors.map((selector) => ({
		selector,
		message:
			"Move this text to src/lib/i18n/locales/en and render it with t(), or with Rich.svelte or richParts() when it has tags",
	}));

const proseAt = ({ parent, field = "" }) => [
	`${parent} > ${proseText}${field}`,
	`${parent} > ArrayExpression${field} > ${proseText}`,
];

const scriptRawTextSelectors = rawText([
	`${toastCall} > ${literalText}`,
	`${toastTextProperty} > ${literalText}`,
	...proseAt({ parent: fallbackOperator, field: ".right" }),
	...proseAt({ parent: "AssignmentPattern", field: ".right" }),
	...proseAt({
		parent: "ConditionalExpression",
		field: ":matches(.consequent, .alternate)",
	}),
	...proseAt({
		parent: `Property:not(${identityProperty}, ${toastTextProperty})`,
		field: ".value",
	}),
	...proseAt({
		parent: `CallExpression:not(${toastCall}, ${schemaCall}, ${lookupCall})`,
		field: ".arguments",
	}),
	...proseAt({ parent: "VariableDeclarator", field: ".init" }),
	...proseAt({ parent: "ReturnStatement" }),
	...proseAt({ parent: "ArrowFunctionExpression", field: ".body" }),
]);

const svelteRawTextSelectors = rawText([
	`SvelteText[value=${letter}]:not(SvelteStyleElement > SvelteText, [value=${brandOnly}])`,
	`${textAttribute} > SvelteLiteral[value=${letter}]`,
	`${textAttribute} > SvelteMustacheTag > ${literalText}`,
	`${componentAttribute} > SvelteLiteral${proseValue}`,
	...proseAt({ parent: `${componentAttribute} > SvelteMustacheTag` }),
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
			"no-restricted-syntax": [
				"error",
				...svelteRawTextSelectors,
				...svelteStaleTextSelectors,
			],
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
		files: ["src/**/*.svelte"],
		ignores: rawTextExemptions,
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
		files: ["src/**/*.ts"],
		ignores: rawTextExemptions,
		rules: {
			"no-restricted-syntax": [
				"error",
				...scriptRawTextSelectors,
				...scriptStaleTextSelectors,
			],
		},
	},
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
