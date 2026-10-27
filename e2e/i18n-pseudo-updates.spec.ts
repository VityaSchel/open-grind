import { expect, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import type * as I18n from "../src/lib/i18n";
import {
	APP_COMPONENT,
	type ComponentKey,
	FCM_COMPONENT,
} from "../src/lib/updates/components";
import type * as ErrorCopy from "../src/lib/updates/error-copy";
import type * as StageCopy from "../src/lib/updates/stage";
import type * as ToastPresenter from "../src/lib/updates/toast-presenter";
import type * as UpdateToasts from "../src/lib/updates/toasts";
import type * as UpdateChecks from "../src/lib/updates/update-checks";
import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";
import { BRAND_TITLE, readPseudoText } from "./support/pseudo";

test.use({ baseURL: DEV_SERVER_URL });

const TOASTER = "[data-sonner-toaster]";
const RELEASE_TAG = "v1.2.0";
const MODULES = {
	i18n: "/src/lib/i18n/index.ts",
	errors: "/src/lib/updates/error-copy.ts",
	stage: "/src/lib/updates/stage.ts",
	presenter: "/src/lib/updates/toast-presenter.ts",
	toasts: "/src/lib/updates/toasts.ts",
	checks: "/src/lib/updates/update-checks.ts",
};
const STAGES = [
	"available",
	"downloading",
	"verifying",
	"paused",
	"ready",
	"installing",
] as const satisfies readonly StageCopy.UpdateStage[];
const INSTALLS: readonly {
	component: ComponentKey;
	kind: StageCopy.InstallKind;
}[] = [
	{ component: APP_COMPONENT, kind: "update" },
	{ component: FCM_COMPONENT, kind: "install" },
	{ component: FCM_COMPONENT, kind: "update" },
];
const RESULT_TOASTS = [
	"problem",
	"addonProblem",
	"addonInstalled",
	"manualInstall",
	"upToDate",
	"addonUpToDate",
	"noAddons",
] as const;

test.describe.configure({ timeout: 180_000 });

function showStageToast(
	page: Page,
	toast: (typeof INSTALLS)[number] & { stage: StageCopy.UpdateStage },
): Promise<string> {
	return page.evaluate(
		async ({ modules, component, kind, stage }) => {
			const load = (url: string) => import(/* @vite-ignore */ url);
			const toasts: typeof UpdateToasts = await load(modules.toasts);
			const copy: typeof StageCopy = await load(modules.stage);
			const ignore = () => {};
			toasts.showStage({
				component,
				kind,
				view: { stage, received: 1, total: 2 },
				onActivate: ignore,
				onCancel: ignore,
				onDismiss: ignore,
			});
			return copy.stageTitle({ component, kind, stage });
		},
		{ modules: MODULES, ...toast },
	);
}

function showResultToast(
	page: Page,
	toast: (typeof RESULT_TOASTS)[number],
): Promise<string> {
	return page.evaluate(
		async ({ modules, toast, app, addon, tag }) => {
			const load = (url: string) => import(/* @vite-ignore */ url);
			const { t }: typeof I18n = await load(modules.i18n);
			const errors: typeof ErrorCopy = await load(modules.errors);
			const { toastPresenter }: typeof ToastPresenter = await load(
				modules.presenter,
			);
			const checks: typeof UpdateChecks = await load(modules.checks);
			const showProblem = (error: unknown) => {
				const title = errors.updateErrorText(error, {
					fallback: "updates.flow.errors.downloadFailed",
					component: addon,
					kind: "update",
				});
				toastPresenter(addon).problem(title);
				return title;
			};
			switch (toast) {
				case "problem":
					return showProblem({ kind: "network" });
				case "addonProblem":
					return showProblem({ kind: "storage" });
				case "addonInstalled":
					toastPresenter(addon).installed({ tag, kind: "update" });
					return t("updates.addons.fcm.updatedVersion", { tag });
				case "manualInstall":
					toastPresenter(app).manualInstall(
						errors.updateErrorText(
							{ kind: "needsManualInstall" },
							{ fallback: "updates.errors.needsManualInstall" },
						),
					);
					return t("updates.toasts.manualInstall");
				case "upToDate":
					toastPresenter(app).upToDate();
					return t("updates.toasts.upToDate");
				case "addonUpToDate":
					toastPresenter(addon).upToDate();
					return t("updates.addons.fcm.upToDate");
				case "noAddons":
					await checks.checkForUpdatesNow({
						selfManaged: false,
						addonAvailable: false,
					});
					return t("updates.checks.noAddons");
			}
		},
		{
			modules: MODULES,
			toast,
			app: APP_COMPONENT,
			addon: FCM_COMPONENT,
			tag: RELEASE_TAG,
		} as const,
	);
}

test("the update toasts render only pseudo-translated text", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/?locale=en-XA");
	await page
		.locator("nav a")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
	const toaster = page.locator(TOASTER);
	const scanToasts = async (title: string) => {
		await toaster.getByText(title, { exact: true }).waitFor();
		const { messages, labels, leaks } = await readPseudoText(toaster, {
			brandTitle: BRAND_TITLE,
		});
		expect(messages).toBeGreaterThan(0);
		expect(leaks).toEqual([]);
		return labels;
	};

	for (const install of INSTALLS) {
		for (const stage of STAGES) {
			const title = await showStageToast(page, { ...install, stage });
			const labels = await scanToasts(title);
			expect(labels > 0, title).toBe(stage === "downloading");
		}
	}
	for (const toast of RESULT_TOASTS) {
		await scanToasts(await showResultToast(page, toast));
	}
});
