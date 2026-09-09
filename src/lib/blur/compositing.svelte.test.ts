// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	isTauriMock: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: invokeMock,
	isTauri: isTauriMock,
}));

import {
	backdropCompositingRenders,
	hydrateBackdropCompositing,
} from "./compositing.svelte";

beforeEach(() => {
	vi.resetModules();
	invokeMock.mockReset();
	isTauriMock.mockReturnValue(true);
});

async function freshModule() {
	vi.resetModules();
	return await import("./compositing.svelte");
}

describe("hydrateBackdropCompositing", () => {
	it("reports what the platform answered", async () => {
		const module = await freshModule();
		invokeMock.mockResolvedValue(false);
		await module.hydrateBackdropCompositing();
		expect(module.backdropCompositingRenders()).toBe(false);
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
		}
	});

	it("asks the platform once, and never off Tauri", async () => {
		isTauriMock.mockReturnValue(false);
		await hydrateBackdropCompositing();
		expect(backdropCompositingRenders()).toBe(true);
		expect(invokeMock).not.toHaveBeenCalled();

		const module = await freshModule();
		invokeMock.mockResolvedValue(true);
		isTauriMock.mockReturnValue(true);
		await module.hydrateBackdropCompositing();
		await module.hydrateBackdropCompositing();
		expect(invokeMock).toHaveBeenCalledTimes(1);
	});
});
