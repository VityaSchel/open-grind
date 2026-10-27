import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "$lib/test/platform";

const { invokeMock, preferences } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	preferences: { onboardingComplete: false },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve(preferences),
}));

async function loadAt(pathname: string): Promise<unknown> {
	const { load } = await import("./+layout");
	return load({
		url: new URL(pathname, "http://tauri.localhost"),
	} as Parameters<typeof load>[0]);
}

beforeEach(() => {
	vi.resetModules();
	invokeMock.mockReset();
	invokeMock.mockResolvedValue(null);
	preferences.onboardingComplete = false;
});

afterEach(resetPlatform);

describe("the onboarding gate on iOS", () => {
	beforeEach(() => {
		runningOn("ios");
	});

	it("opens onboarding on a first launch without asking the backend", async () => {
		await expect(loadAt("/")).rejects.toMatchObject({
			status: 303,
			location: "/onboarding",
		});
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("leaves onboarding once it is complete", async () => {
		preferences.onboardingComplete = true;

		await expect(loadAt("/onboarding")).rejects.toMatchObject({
			status: 303,
			location: "/",
		});
	});
});

describe.each(["android", "linux", "macos", "windows"] as const)(
	"the onboarding gate on %s",
	(platform) => {
		beforeEach(() => {
			runningOn(platform);
		});

		it("opens onboarding on a first launch after probing for updates", async () => {
			await expect(loadAt("/")).rejects.toMatchObject({
				status: 303,
				location: "/onboarding",
			});
			expect(invokeMock).toHaveBeenCalledWith("updater_capability");
		});
	},
);
