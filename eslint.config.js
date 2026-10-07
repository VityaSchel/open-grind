import {
	conditionalClassSelectors,
	sveltekit,
} from "@opengrind/config/eslint/svelte";
import { defineConfig } from "eslint/config";

import svelteConfig from "./svelte.config.js";

const vendoredGlob = "src/lib/components/ui/**";

const translatedSvelteFiles = [
	"src/routes/+error.svelte",
	"src/routes/+layout.svelte",
	"src/lib/components/feedback/AccountStatusAlert.svelte",
	"src/lib/components/feedback/ApiErrorDisplay.svelte",
	"src/lib/components/feedback/AutoLocationToast.svelte",
	"src/lib/components/feedback/CopyErrorConfirmAlert.svelte",
	"src/lib/components/feedback/DataRefreshControl.svelte",
	"src/lib/components/feedback/EntitlementBypassAlert.svelte",
	"src/lib/components/feedback/NotFound.svelte",
	"src/lib/components/feedback/RequestBlockedAlert.svelte",
	"src/lib/components/feedback/SessionErrorAlert.svelte",
	"src/lib/components/feedback/ToastUnimplemented.svelte",
	"src/lib/components/feedback/refresh/RefreshDisc.svelte",
	"src/lib/components/filters/OptionFilter.svelte",
	"src/lib/components/incoming-message-toast/IncomingMessageToast.svelte",
	"src/lib/components/location-chooser/GeoMapPicker.svelte",
	"src/lib/components/navigation/BackLink.svelte",
	"src/lib/components/profile/DisplayName.svelte",
	"src/lib/components/profile/TapIcon.svelte",
	"src/lib/components/shared/NavBar.svelte",
	"src/lib/components/shared/SaveChangesBar.svelte",
	"src/lib/components/shared/ScrollJumpButton.svelte",
	"src/lib/components/shared/ScrollToTopButton.svelte",
	"src/lib/components/shared/SubpageScreen.svelte",
	"src/routes/(protected)/+layout.svelte",
	"src/routes/(protected)/(navbar)/+layout.svelte",
	"src/routes/(protected)/(navbar)/interest/+layout.svelte",
	"src/routes/(protected)/(navbar)/interest/InterestPager.svelte",
	"src/routes/(protected)/(navbar)/interest/taps/EmptyTapsList.svelte",
	"src/routes/(protected)/(navbar)/interest/taps/TapReceivedProfile.svelte",
	"src/routes/(protected)/(navbar)/interest/taps/TapsReceivedList.svelte",
	"src/routes/(protected)/(navbar)/interest/views/EmptyViewsGrid.svelte",
	"src/routes/(protected)/(navbar)/interest/views/UntrackedViewsGrid.svelte",
	"src/routes/(protected)/(navbar)/interest/views/ViewedPreview.svelte",
	"src/routes/(protected)/(navbar)/interest/views/ViewedProfile.svelte",
	"src/routes/(protected)/(navbar)/interest/views/ViewsGrid.svelte",
	"src/routes/(protected)/(navbar)/profile/[[]profileId]/AboutMe.svelte",
	"src/routes/(protected)/(navbar)/profile/[[]profileId]/fields/LastTested.svelte",
	"src/routes/(protected)/(navbar)/profile/[[]profileId]/fields/LookupField.svelte",
	"src/routes/(protected)/(navbar)/profile/[[]profileId]/fields/Socials.svelte",
	"src/routes/(protected)/(navbar)/profile/[[]profileId]/bottom-nav/TapProfileButton.svelte",
	"src/routes/(protected)/(navbar)/profile/[[]profileId]/HeightWeightBodyType.svelte",
	"src/routes/(protected)/(navbar)/profile/[[]profileId]/ProfileHeading.svelte",
	"src/routes/(protected)/(navbar)/profile/[[]profileId]/SexualPosition.svelte",
	"src/routes/(protected)/(navbar)/right-now/+page.svelte",
	"src/routes/(protected)/(navbar)/settings/(subpage)/+layout.svelte",
	"src/routes/(protected)/(navbar)/settings/(subpage)/app/credits/BlurbText.svelte",
	"src/routes/(protected)/chat/[[]conversationId]/message-composer/attachments/ComposerUnimplementedTab.svelte",
	"src/routes/(protected)/chat/[[]conversationId]/messages/message/MessageDateGroup.svelte",
	"src/routes/(protected)/chat/[[]conversationId]/messages/message/MessageQuote.svelte",
	"src/routes/(protected)/chat/[[]conversationId]/messages/message/TextMessage.svelte",
	"src/routes/auth/+layout.svelte",
	"src/routes/auth/password-reset/+page.svelte",
	"src/routes/auth/password-reset/ForgotPasswordForm.svelte",
	"src/routes/auth/sign-in/+page.svelte",
	"src/routes/auth/sign-in/SignInForm.svelte",
	"src/routes/auth/sign-in/google/+page.svelte",
	"src/routes/auth/sign-up/+page.svelte",
	"src/routes/auth/sign-up/RegisterForm.svelte",
	"src/routes/onboarding/+page.svelte",
];

const translatedScriptFiles = [
	"src/lib/api/api-error.ts",
	"src/lib/api/error-copy.ts",
	"src/lib/api/error-toast.ts",
	"src/lib/api/methods.ts",
	"src/lib/api/persistent-error-toast.ts",
	"src/lib/api/session-recovery.svelte.ts",
	"src/lib/api/sign-in.ts",
	"src/lib/api/sign-out.ts",
	"src/lib/api/storage-notice.ts",
	"src/lib/chat/conversations-state.svelte.ts",
	"src/lib/chat/optimistic-batch.ts",
	"src/lib/credits/highlights.ts",
	"src/lib/components/filters/distance/distance-steps.ts",
	"src/lib/entitlements/bypass.svelte.ts",
	"src/lib/interest/taps-last-viewed.ts",
	"src/lib/interest/taps-state.svelte.ts",
	"src/lib/model/browse/grid/filters.ts",
	"src/lib/model/interest/taps.ts",
	"src/lib/model/messaging/message-preview.ts",
	"src/lib/model/users/profiles.ts",
	"src/lib/util/format-time.ts",
	"src/lib/util/photoswipe.ts",
	"src/lib/util/reconciling-list-state.svelte.ts",
	"src/lib/util/units.ts",
	"src/routes/(protected)/(navbar)/interest/+page.ts",
	"src/routes/(protected)/(navbar)/interest/tabs.ts",
	"src/routes/(protected)/(navbar)/interest/views/views-state.svelte.ts",
	"src/routes/(protected)/(navbar)/settings/(subpage)/albums/album-editor/album-updated-label.ts",
	"src/routes/(protected)/(navbar)/settings/(subpage)/profile/options.ts",
	"src/routes/auth/+layout.ts",
];

const brands = [
	"Open Grind",
	"Grindr",
	"Google",
	"Facebook",
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
const diagnosticCall = `:matches(CallExpression[callee.object.name="console"], CallExpression[callee.name="writeText"], CallExpression[callee.property.name="writeText"], NewExpression[callee.name=/Error$/])`;
const proseText = `:matches(${proseLiteral}, ${proseTemplate}):not(${diagnosticCall} *)`;
const toastCall = `CallExpression:matches([callee.name="toast"], [callee.object.name="toast"][callee.property.name!="dismiss"])`;
const toastTextProperty = `:matches(${toastCall} > ObjectExpression Property[key.name=/^(?:description|label)$/], CallExpression[callee.name="showErrorToast"] > ObjectExpression > Property[key.name="label"])`;
const fallbackOperator = `LogicalExpression:matches([operator="??"], [operator="||"]):not(BinaryExpression[operator=/^[!=]==?$/] > *)`;
const identityProperty = `Property[key.name=/^(?:kind|type)$/]`;
const textAttribute = `SvelteAttribute[key.name=/^(?:aria-label|aria-description|alt|title|placeholder)$/]`;
const schemaCall = `CallExpression:matches([callee.object.name="z"], [callee.property.name="catch"])`;
const componentAttribute = `SvelteElement[kind="component"] > SvelteStartTag > SvelteAttribute:not(${textAttribute})`;

const rawText = (selectors) =>
	selectors.map((selector) => ({
		selector,
		message: "Render interface text through t() from $lib/i18n",
	}));

const scriptRawTextSelectors = rawText([
	`${toastCall} > ${literalText}`,
	`${toastTextProperty} > ${literalText}`,
	`${fallbackOperator} > ${proseText}.right`,
	`AssignmentPattern > ${proseText}.right`,
	`ConditionalExpression > ${proseText}:matches(.consequent, .alternate)`,
	`Property:not(${identityProperty}, ${toastTextProperty}) > ${proseText}.value`,
	`CallExpression:not(${toastCall}, ${schemaCall}) > ${proseText}.arguments`,
	`VariableDeclarator > ${proseText}.init`,
	`ReturnStatement > ${proseText}`,
	`ArrowFunctionExpression > ${proseText}.body`,
]);

const svelteRawTextSelectors = rawText([
	`SvelteText[value=${letter}]:not(SvelteStyleElement > SvelteText, [value=${brandOnly}])`,
	`${textAttribute} > SvelteLiteral[value=${letter}]`,
	`${textAttribute} > SvelteMustacheTag > ${literalText}`,
	`${componentAttribute} > SvelteLiteral${proseValue}`,
	`${componentAttribute} > SvelteMustacheTag > ${proseText}`,
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
