import type { Page } from "@playwright/test";

import type {
	InstallKind,
	UpdateComponent,
	UpdateStagePresenter,
} from "../../../src/lib/demo/screenshot-scene";
import type { PlainMessageKey } from "../../../src/lib/i18n/types";
import type { Scene } from ".";
import { holdToast, SHOWN_TOAST } from "./toast";
import { visit } from "./visit";

export type UpdateStageView = Parameters<
	UpdateStagePresenter["show"]
>[0]["view"];

export type UpdateStage = UpdateStageView["stage"];

export type UpdateToast =
	| {
			type: "stage";
			component: UpdateComponent;
			kind: InstallKind;
			stage: UpdateStage;
	  }
	| { type: "problem"; component: UpdateComponent; key: PlainMessageKey }
	| {
			type: "installed";
			component: UpdateComponent;
			kind: InstallKind;
			tag: string | null;
	  }
	| { type: "upToDate"; component: UpdateComponent };

type ShownUpdateToast =
	| Exclude<UpdateToast, { type: "stage" }>
	| {
			type: "stage";
			component: UpdateComponent;
			kind: InstallKind;
			view: UpdateStageView;
	  };

export const UPDATE_STAGES = [
	"available",
	"downloading",
	"verifying",
	"paused",
	"ready",
	"installing",
] as const satisfies readonly UpdateStage[];

const DOWNLOAD_BYTES = 61_800_000;
const RECEIVED_BYTES = 23_400_000;
const STAGE_PROGRESS = {
	available: { received: 0, total: 0 },
	downloading: { received: RECEIVED_BYTES, total: DOWNLOAD_BYTES },
	verifying: { received: 0, total: 0 },
	paused: { received: RECEIVED_BYTES, total: DOWNLOAD_BYTES },
	ready: { received: DOWNLOAD_BYTES, total: DOWNLOAD_BYTES },
	installing: { received: DOWNLOAD_BYTES, total: DOWNLOAD_BYTES },
} as const satisfies Record<UpdateStage, Omit<UpdateStageView, "stage">>;

export async function openAppSettings(page: Page): Promise<void> {
	await visit({
		page,
		path: "/settings/app",
		ready: page.getByRole("main").getByRole("heading"),
	});
}

function withProgress(toast: UpdateToast): ShownUpdateToast {
	if (toast.type !== "stage") return toast;
	const { stage, ...shown } = toast;
	return { ...shown, view: { stage, ...STAGE_PROGRESS[stage] } };
}

export async function showUpdateToasts({
	page,
	toasts,
}: {
	page: Page;
	toasts: UpdateToast[];
}): Promise<void> {
	const shownBefore = await page.locator(SHOWN_TOAST).count();
	await page.evaluate((requested) => {
		const hooks = window.__openGrindScreenshots;
		if (hooks === undefined) {
			throw new Error("The build installed no screenshot hooks");
		}
		const ignore = () => {};
		for (const toast of requested) {
			const presenter = hooks.updateToasts(toast.component);
			switch (toast.type) {
				case "stage":
					presenter.show({
						view: toast.view,
						kind: toast.kind,
						onActivate: ignore,
						onCancel: ignore,
						onDismiss: ignore,
					});
					break;
				case "problem":
					hooks.updateProblem(toast);
					break;
				case "installed":
					presenter.installed(toast);
					break;
				case "upToDate":
					presenter.upToDate();
					break;
			}
		}
	}, toasts.map(withProgress));
	await page
		.locator(SHOWN_TOAST)
		.nth(shownBefore + toasts.length - 1)
		.waitFor();
	await holdToast(page);
}

export function updateToastScene({
	id,
	toasts,
	platform = "phone",
	shim,
}: {
	id: string;
	toasts: UpdateToast[];
	platform?: Scene["platform"];
	shim?: Scene["shim"];
}): Scene {
	return {
		platform,
		shim,
		views: [
			{
				id,
				survivesLocaleSwitch: false,
				drive: async (page) => {
					await openAppSettings(page);
					await showUpdateToasts({ page, toasts });
				},
			},
		],
	};
}

export const upToDateToast = updateToastScene({
	id: "updates/up-to-date",
	toasts: [{ type: "upToDate", component: "app" }],
});

export const downloadToast: Scene = {
	...updateToastScene({
		id: "updates/downloading",
		toasts: [
			{
				type: "stage",
				component: "app",
				kind: "update",
				stage: "downloading",
			},
		],
	}),
	demo: { updates: true },
};
