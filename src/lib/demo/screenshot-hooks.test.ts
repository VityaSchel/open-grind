import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const { toast, hookedAtStartup, noteHooked } = vi.hoisted(() => {
	const hooked: string[] = [];
	return {
		toast: { error: vi.fn(), custom: vi.fn(), dismiss: vi.fn() },
		hookedAtStartup: hooked,
		noteHooked: (step: string) => {
			if (window.__openGrindScreenshots !== undefined) hooked.push(step);
		},
	};
});

vi.mock("svelte-sonner", () => ({ toast }));
vi.mock("$lib/ws.svelte", () => ({
	ws: { connect: vi.fn(() => noteHooked("ws.connect")) },
}));
vi.mock("$lib/platform/regional-settings", () => ({
	startRegionalSettings: vi.fn(() => {
		noteHooked("startRegionalSettings");
		return Promise.resolve();
	}),
}));
vi.mock("$lib/platform/app-language", () => ({
	startLanguage: vi.fn(() => {
		noteHooked("startLanguage");
		return Promise.resolve();
	}),
}));

import type { ScreenshotHooks } from "./screenshot-scene";

const HOOK_NAMES = [
	"matchSourceLayout",
	"recordSourceLayout",
	"scan",
	"setLocale",
	"setScene",
	"showErrorToast",
	"updateProblem",
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
	hookedAtStartup.length = 0;
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
		expect(hookedAtStartup).toEqual([
			"ws.connect",
			"startRegionalSettings",
			"startLanguage",
		]);
	});

	it("starts from the scene the page seeded and shares it", async () => {
		window.__openGrindScreenshotScene = {
			signedOut: true,
			emptyLists: ["taps"],
		};
		await startHookedApp();
		const { screenshotScene } = await import("./screenshot-scene");
		expect(screenshotScene).toEqual({
			signedOut: true,
			onboarding: false,
			updates: false,
			playBuild: false,
			emptyLists: ["taps"],
			inbox: null,
			profiles: {},
			maskedProfiles: [],
			restriction: null,
			restFaults: [],
			methodFaults: [],
			methodAnswers: {},
		});
	});

	it("merges a later scene change into the seeded scene", async () => {
		window.__openGrindScreenshotScene = {
			signedOut: true,
			methodAnswers: { storage_backend: "file" },
		};
		const hooks = await startHookedApp();
		const restFaults = [{ path: "/v4/inbox", status: 500 }];
		hooks.setScene({ restFaults });
		hooks.setScene({ methodAnswers: { storage_backend: "unavailable" } });
		const { screenshotScene } = await import("./screenshot-scene");
		expect(screenshotScene).toMatchObject({
			signedOut: true,
			restFaults,
			methodAnswers: { storage_backend: "unavailable" },
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

	it("titles an update problem by key and names the add-on it is about", async () => {
		const hooks = await startHookedApp();
		const { t } = await import("$lib/i18n");
		hooks.updateProblem({
			component: "fcm",
			key: "updates.errors.network",
		});
		hooks.updateProblem({
			component: "fcm",
			key: "updates.addons.fcm.errors.busy",
		});
		hooks.updateProblem({
			component: "app",
			key: "updates.errors.busyApp",
		});
		expect(
			toast.custom.mock.calls.map(([, { componentProps }]) => ({
				title: componentProps.title,
				body: componentProps.body,
				tone: componentProps.tone,
			})),
		).toEqual([
			{
				title: t("updates.errors.network"),
				body: t("updates.addons.fcm.name"),
				tone: "error",
			},
			{
				title: t("updates.addons.fcm.errors.busy"),
				body: undefined,
				tone: "error",
			},
			{
				title: t("updates.errors.busyApp"),
				body: undefined,
				tone: "error",
			},
		]);
	});

	it("shows every update result the update flow shows", async () => {
		const hooks = await startHookedApp();
		const { t } = await import("$lib/i18n");
		hooks
			.updateToasts("recaptcha")
			.installed({ tag: "v1.2.0", kind: "install" });
		hooks.updateToasts("fcm").installed({ tag: null, kind: "update" });
		hooks.updateToasts("google-oauth").upToDate();
		hooks.updateToasts("app").manualInstall("Drag it onto Applications");
		expect(
			toast.custom.mock.calls.map(([, { componentProps }]) => ({
				title: componentProps.title,
				body: componentProps.body,
			})),
		).toEqual([
			{
				title: t("updates.addons.recaptcha.installedVersion", {
					tag: "v1.2.0",
				}),
				body: t("updates.toasts.changelog"),
			},
			{ title: t("updates.addons.fcm.updated"), body: undefined },
			{
				title: t("updates.addons.googleOauth.upToDate"),
				body: undefined,
			},
			{
				title: t("updates.toasts.manualInstall"),
				body: "Drag it onto Applications",
			},
		]);
	});
});
