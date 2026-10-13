import type { PlainMessageKey } from "../../../src/lib/i18n/types";
import type { Scene } from ".";
import { type UpdateToast, updateToastScene } from "./updates";
import { ADDONS } from "./updates-stages";

type Addon = (typeof ADDONS)[number];

type AddonError =
	| "externallyManaged"
	| "foreignSigner"
	| "foreignTarget"
	| "noReleaseArtifacts"
	| "undetermined"
	| "downloadFailed"
	| "verifyFailed"
	| "saveDownloadFailed"
	| "installFailed"
	| "updateFailed"
	| "noStorageToInstall"
	| "noStorageToUpdate"
	| "busy"
	| "noRelease";

type ThreeKeys = readonly [PlainMessageKey, PlainMessageKey, PlainMessageKey];

const ADDON_MESSAGES = {
	"google-oauth": "googleOauth",
	recaptcha: "recaptcha",
	fcm: "fcm",
} as const satisfies Record<Addon, string>;

const ADDON_ERROR_VIEWS = [
	["externallyManaged", "foreignSigner", "foreignTarget"],
	["noReleaseArtifacts", "undetermined", "downloadFailed"],
	["verifyFailed", "saveDownloadFailed", "installFailed"],
	["updateFailed", "noStorageToInstall", "noStorageToUpdate"],
] as const satisfies readonly (readonly AddonError[])[];

const GENERIC_ADDON_ERRORS = {
	"google-oauth": [
		"updates.errors.network",
		"updates.errors.serverRefused",
		"updates.errors.checkFailed",
	],
	recaptcha: [
		"updates.errors.malformedIndex",
		"updates.errors.noArtifact",
		"updates.errors.oversize",
	],
	fcm: [
		"updates.errors.assetReplaced",
		"updates.errors.needsUnknownSources",
		"updates.flow.errors.openPermissionScreenFailed",
	],
} as const satisfies Record<Addon, ThreeKeys>;

const APP_PROBLEM_VIEWS = [
	[
		"updates.flow.errors.downloadFailed",
		"updates.errors.writeFailed",
		"updates.errors.busyApp",
	],
	[
		"updates.errors.noRelease",
		"updates.errors.unknownComponent",
		"updates.errors.unsupported.undetermined",
	],
	[
		"updates.errors.unsupported.externallyManaged",
		"updates.errors.unsupported.foreignSigner",
		"updates.errors.unsupported.foreignTarget",
	],
] as const satisfies readonly ThreeKeys[];

const LINUX_APP_PROBLEMS = [
	"updates.errors.unsupported.noReleaseArtifacts",
	"updates.errors.unsupported.sandboxed",
	"updates.errors.unsupported.locationNotWritable",
] as const satisfies ThreeKeys;

function addonErrorKey({
	addon,
	error,
}: {
	addon: Addon;
	error: AddonError;
}): PlainMessageKey {
	return `updates.addons.${ADDON_MESSAGES[addon]}.errors.${error}`;
}

function problems({
	component,
	keys,
}: {
	component: UpdateToast["component"];
	keys: readonly PlainMessageKey[];
}): UpdateToast[] {
	return keys.map((key) => ({ type: "problem", component, key }));
}

function addonProblemViews(addon: Addon): UpdateToast[][] {
	const addonProblems = (errors: readonly AddonError[]) =>
		problems({
			component: addon,
			keys: errors.map((error) => addonErrorKey({ addon, error })),
		});
	const [first, second, third] = GENERIC_ADDON_ERRORS[addon];
	return [
		...ADDON_ERROR_VIEWS.map(addonProblems),
		[
			...addonProblems(["busy", "noRelease"]),
			...problems({ component: addon, keys: [first] }),
		],
		[
			...problems({ component: addon, keys: [second, third] }),
			{ type: "upToDate", component: addon },
		],
	];
}

export const addonProblemToasts: Scene[] = ADDONS.flatMap((addon) =>
	addonProblemViews(addon).map((toasts, index) =>
		updateToastScene({
			id: `updates/addon-problems/${addon}-${index + 1}`,
			toasts,
		}),
	),
);

export const appProblemToasts: Scene[] = [
	...APP_PROBLEM_VIEWS.map((keys, index) =>
		updateToastScene({
			id: `updates/app-problems/${index + 1}`,
			toasts: problems({ component: "app", keys }),
		}),
	),
	updateToastScene({
		id: "updates/app-problems/linux",
		toasts: problems({ component: "app", keys: LINUX_APP_PROBLEMS }),
		platform: "desktop",
		shim: "linux",
	}),
	updateToastScene({
		id: "updates/app-problems/macos",
		toasts: problems({
			component: "app",
			keys: ["updates.errors.needsManualInstall"],
		}),
		platform: "desktop",
	}),
	updateToastScene({
		id: "updates/app-installed",
		toasts: [
			{ type: "installed", component: "app", kind: "update", tag: null },
		],
	}),
];
