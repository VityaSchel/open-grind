import type {
	InstallKind,
	UpdateComponent,
} from "../../../src/lib/demo/screenshot-scene";
import type { PlainMessageKey } from "../../../src/lib/i18n/types";
import type { Scene } from ".";
import {
	UPDATE_STAGES,
	type UpdateStage,
	type UpdateToast,
	updateToastScene,
} from "./updates";

export const ADDONS = [
	"google-oauth",
	"recaptcha",
	"fcm",
] as const satisfies readonly UpdateComponent[];

const INSTALL_KINDS = [
	"install",
	"update",
] as const satisfies readonly InstallKind[];

const RELEASE_TAG = "v1.2.0";

const ADDON_INSTALLS = [
	{ id: "installed", kind: "install", tag: null },
	{ id: "installed-version", kind: "install", tag: RELEASE_TAG },
	{ id: "updated", kind: "update", tag: null },
	{ id: "updated-version", kind: "update", tag: RELEASE_TAG },
] as const satisfies readonly {
	id: string;
	kind: InstallKind;
	tag: string | null;
}[];

const APP_STAGE_PROBLEMS = {
	available: [
		"updates.errors.checkTooSoon",
		"updates.errors.autoChecksDisabled",
	],
	downloading: [
		"updates.flow.errors.stopDownloadFailed",
		"updates.errors.busy",
	],
	verifying: ["updates.errors.verifyFailed", "updates.errors.foreignUrl"],
	paused: [
		"updates.errors.canceled",
		"updates.flow.errors.startDownloadFailed",
	],
	ready: ["updates.errors.nothingStaged", "updates.flow.finishOtherInstall"],
	installing: ["updates.errors.installFailed", "updates.errors.noStorage"],
} as const satisfies Record<UpdateStage, readonly PlainMessageKey[]>;

export const addonStageToasts: Scene[] = INSTALL_KINDS.flatMap((kind) =>
	UPDATE_STAGES.map((stage) =>
		updateToastScene({
			id: `updates/addon-stage/${kind}-${stage}`,
			toasts: ADDONS.map((component) => ({
				type: "stage",
				component,
				kind,
				stage,
			})),
		}),
	),
);

export const addonInstalledToasts: Scene[] = ADDON_INSTALLS.map(
	({ id, kind, tag }) =>
		updateToastScene({
			id: `updates/addon-installed/${id}`,
			toasts: ADDONS.map((component) => ({
				type: "installed",
				component,
				kind,
				tag,
			})),
		}),
);

export const appStageToasts: Scene[] = UPDATE_STAGES.map((stage) =>
	updateToastScene({
		id: `updates/app-stage/${stage}`,
		toasts: [
			...APP_STAGE_PROBLEMS[stage].map(
				(key): UpdateToast => ({
					type: "problem",
					component: "app",
					key,
				}),
			),
			{ type: "stage", component: "app", kind: "update", stage },
		],
	}),
);
