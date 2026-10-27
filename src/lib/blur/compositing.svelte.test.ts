// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
	vi.resetModules();
	invokeMock.mockReset();
});

async function freshModule() {
	vi.resetModules();
	return await import("./compositing.svelte");
}

describe("hydrateBackdropCompositing", () => {
	it("reports what the platform answered", async () => {
		const module = await freshModule();
		invokeMock.mockImplementation((command: string) =>
			Promise.resolve(command === "webview_engine" ? "2.54.1" : false),
		);
		expect(module.backdropCompositingHydrated()).toBe(false);
		await module.hydrateBackdropCompositing();
		expect(module.backdropCompositingRenders()).toBe(false);
		expect(module.webviewEngine()).toBe("2.54.1");
		expect(module.backdropCompositingHydrated()).toBe(true);
	});

	it("keeps the blur when the platform answers nothing usable", async () => {
		for (const answer of [
			null,
			undefined,
			Promise.reject(new Error("x")),
		]) {
			const module = await freshModule();
			invokeMock.mockReturnValue(
				Promise.resolve(answer).catch(() => null),
			);
			await module.hydrateBackdropCompositing();
			expect(module.backdropCompositingRenders()).toBe(true);
			expect(module.webviewEngine()).toBeNull();
			expect(module.backdropCompositingHydrated()).toBe(true);
		}
	});

	it("asks the platform once", async () => {
		const module = await freshModule();
		invokeMock.mockResolvedValue(true);
		await module.hydrateBackdropCompositing();
		await module.hydrateBackdropCompositing();
		expect(invokeMock.mock.calls.map(([command]) => command)).toEqual([
			"backdrop_filter_renders",
			"webview_engine",
		]);
	});
});
