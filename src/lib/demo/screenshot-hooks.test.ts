import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const { goto, toast } = vi.hoisted(() => ({
	goto: vi.fn(),
	toast: { error: vi.fn(), custom: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("svelte-sonner", () => ({ toast }));
vi.mock("$lib/ws.svelte", () => ({ ws: { connect: vi.fn() } }));
vi.mock("$lib/platform/regional-settings", () => ({
	startRegionalSettings: vi.fn(() => Promise.resolve()),
}));

import type { ScreenshotHooks } from "./screenshot-scene";

const HOOK_NAMES = [
	"goto",
	"scene",
	"setLocale",
	"showErrorToast",
	"updateErrorText",
	"updateToasts",
];
const FRESH_IMPORTS = { timeout: 60_000 };

async function startApp(): Promise<ScreenshotHooks | undefined> {
	vi.resetModules();
	const { init } = await import("../../hooks.client");
	await init();
	return window.__openGrindScreenshots;
}

async function startHookedApp(): Promise<ScreenshotHooks> {
	const hooks = await startApp();
	if (hooks === undefined) throw new Error("no screenshot hooks installed");
	return hooks;
}

beforeAll(async () => {
	await import("./screenshot-hooks");
}, FRESH_IMPORTS.timeout);

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllEnvs();
	delete window.__openGrindScreenshots;
	delete window.__openGrindScreenshotScene;
	document.documentElement.lang = "en";
});

describe("without OPEN_GRIND_SCREENSHOTS", FRESH_IMPORTS, () => {
	it("installs no screenshot hooks", async () => {
		window.__openGrindScreenshotScene = { signedOut: true };
		expect(await startApp()).toBeUndefined();
		const { screenshotScene } = await import("./screenshot-scene");
		expect(screenshotScene.signedOut).toBe(false);
	});

	it("installs none outside the demo either", async () => {
		vi.stubEnv("OPEN_GRIND_SCREENSHOTS", "1");
		expect(await startApp()).toBeUndefined();
	});
});

describe("with OPEN_GRIND_SCREENSHOTS=1", FRESH_IMPORTS, () => {
	beforeEach(() => {
		vi.stubEnv("OPEN_GRIND_DEMO", "1");
		vi.stubEnv("OPEN_GRIND_SCREENSHOTS", "1");
	});

	it("installs the hooks before the app starts", async () => {
		const hooks = await startHookedApp();
		expect(Object.keys(hooks).sort()).toEqual(HOOK_NAMES);
	});

	it("starts from the scene the page seeded and shares it", async () => {
		window.__openGrindScreenshotScene = {
			signedOut: true,
			emptyLists: ["taps"],
		};
		const hooks = await startHookedApp();
		const { screenshotScene } = await import("./screenshot-scene");
		expect(hooks.scene).toBe(screenshotScene);
		expect(hooks.scene).toEqual({
			signedOut: true,
			onboarding: false,
			updates: false,
			emptyLists: ["taps"],
			restriction: null,
			restFaults: [],
			methodFaults: [],
		});
	});

	it("switches the app language", async () => {
		const hooks = await startHookedApp();
		const { getLocale } = await import("$lib/i18n");
		await hooks.setLocale({ locale: "en-XM" });
		expect(getLocale()).toBe("en-XM");
		expect(document.documentElement.lang).toBe("en-XM");
		await hooks.setLocale({ locale: "en" });
		expect(getLocale()).toBe("en");
	});

	it("navigates inside the app", async () => {
		const hooks = await startHookedApp();
		await hooks.goto("/auth/sign-in");
		expect(goto).toHaveBeenCalledWith("/auth/sign-in");
	});

	it("shows the error toast with retry and copy actions", async () => {
		const hooks = await startHookedApp();
		const { t } = await import("$lib/i18n");
		hooks.showErrorToast({
			label: "Couldn’t load taps.",
			error: new Error("offline"),
			onRetry: () => {},
		});
		expect(toast.error).toHaveBeenCalledWith(
			"Couldn’t load taps.",
			expect.objectContaining({
				action: expect.objectContaining({
					label: t("common.actions.retry"),
				}),
				cancel: expect.objectContaining({
					label: t("common.actions.copyError"),
				}),
			}),
		);
	});

	it("shows the update toasts the update flow shows", async () => {
		const hooks = await startHookedApp();
		const { t } = await import("$lib/i18n");
		hooks.updateToasts("app").upToDate();
		hooks
			.updateToasts("app")
			.show({
				view: { stage: "downloading", received: 1, total: 2 },
				kind: "update",
				onActivate: () => {},
				onCancel: () => {},
				onDismiss: () => {},
			});
		expect(toast.custom.mock.calls).toEqual([
			[
				expect.anything(),
				expect.objectContaining({
					componentProps: expect.objectContaining({
						title: t("updates.toasts.upToDate"),
					}),
				}),
			],
			[
				expect.anything(),
				expect.objectContaining({
					id: "update",
					componentProps: expect.objectContaining({
						stage: "downloading",
						component: "app",
					}),
				}),
			],
		]);
	});

	it("words update errors as the update flow does", async () => {
		const hooks = await startHookedApp();
		const { t } = await import("$lib/i18n");
		expect(
			hooks.updateErrorText(
				{ kind: "storage" },
				{ fallback: "updates.flow.errors.downloadFailed" },
			),
		).toBe(t("updates.errors.writeFailed"));
		expect(
			hooks.updateErrorText(new Error("unknown"), {
				fallback: "updates.flow.errors.downloadFailed",
			}),
		).toBe(t("updates.flow.errors.downloadFailed"));
	});
});
