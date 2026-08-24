// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accountStatusState } from "$lib/api/account-status-state.svelte";
import AccountStatusAlert from "./AccountStatusAlert.svelte";

const { callMethodMock, tauriListeners } = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	tauriListeners: new Map<string, (event: { payload: unknown }) => void>(),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: (name: string, handler: (event: { payload: unknown }) => void) => {
		tauriListeners.set(name, handler);
		return Promise.resolve(() => tauriListeners.delete(name));
	},
}));
vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));

function emit(event: string, payload: unknown) {
	tauriListeners.get(event)?.({ payload });
}

beforeEach(() => {
	callMethodMock.mockResolvedValue(null);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	tauriListeners.clear();
	accountStatusState.open = false;
	accountStatusState.status = null;
});

describe("AccountStatusAlert", () => {
	it("shows the restriction pushed after a relaunch mints the first token", async () => {
		render(AccountStatusAlert);
		await vi.waitFor(() => {
			expect(tauriListeners.has("auth:restriction")).toBe(true);
		});

		emit("auth:restriction", {
			kind: "ageVerification",
			region: "GB",
			reason: "age_verification_required",
		});

		expect(accountStatusState.open).toBe(true);
		expect(
			await screen.findByText("Age verification required"),
		).toBeTruthy();
	});

	it("ignores a malformed restriction payload", async () => {
		render(AccountStatusAlert);
		await vi.waitFor(() => {
			expect(tauriListeners.has("auth:restriction")).toBe(true);
		});

		emit("auth:restriction", { unexpected: true });

		expect(accountStatusState.open).toBe(false);
	});
});
