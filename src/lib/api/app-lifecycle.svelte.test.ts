import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	callMethod: vi.fn<(method: string, args?: unknown) => Promise<unknown>>(),
	invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
}));

vi.mock("#lib/api/methods.ts", () => ({ callMethod: mocks.callMethod }));
vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: mocks.invoke,
}));

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { setVisibility } from "#lib/test/visibility.ts";
import { appLifecycle } from "./app-lifecycle.svelte";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function allowedSuspensions(): number {
	return mocks.invoke.mock.calls.filter(
		([command]) => command === "allow_suspension",
	).length;
}

beforeEach(() => {
	mocks.callMethod.mockResolvedValue(null);
	mocks.invoke.mockResolvedValue(null);
});

afterEach(async () => {
	setVisibility("visible");
	await settle();
	vi.clearAllMocks();
	resetPlatform();
});

describe("appLifecycle on iOS", () => {
	it("lets iOS, and only iOS, suspend the app once it has deactivated", async () => {
		runningOn("android");
		setVisibility("hidden");
		await settle();
		setVisibility("visible");
		await settle();
		expect(allowedSuspensions()).toBe(0);

		runningOn("ios");
		const deactivation = Promise.withResolvers<null>();
		mocks.callMethod.mockReturnValueOnce(deactivation.promise);

		setVisibility("hidden");
		await settle();

		expect(mocks.callMethod).toHaveBeenCalledWith("set_app_active", {
			active: false,
		});
		expect(allowedSuspensions()).toBe(0);

		deactivation.resolve(null);
		await settle();

		expect(allowedSuspensions()).toBe(1);
	});

	it("keeps the app awake until work it was asked to finish is done", async () => {
		runningOn("ios");
		const work = Promise.withResolvers<void>();
		appLifecycle.finishBeforeSuspending(work.promise);

		setVisibility("hidden");
		await settle();
		expect(allowedSuspensions()).toBe(0);

		work.resolve();
		await settle();
		expect(allowedSuspensions()).toBe(1);
	});
});
