// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accountStatusState } from "$lib/api/account-status-state.svelte";
import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import AccountStatusAlert from "./AccountStatusAlert.svelte";

const { callMethodMock, signOutMock, tauriListeners } = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	signOutMock: vi.fn(),
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
vi.mock("$lib/api/sign-out", () => ({ signOut: signOutMock }));

function emit(event: string, payload: unknown) {
	tauriListeners.get(event)?.({ payload });
}

const button = (name: string) => screen.getByRole("button", { name });

async function showBan() {
	render(AccountStatusAlert);
	await vi.waitFor(() => {
		expect(tauriListeners.has("auth:banned")).toBe(true);
	});
	emit("auth:banned", { kind: "banned", code: 27, message: "Banned" });
	await vi.waitFor(() => button("Sign out"));
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

	it("marks Sign out busy and locks both buttons while signing out", async () => {
		const signOut = Promise.withResolvers<void>();
		signOutMock.mockReturnValueOnce(signOut.promise);
		await showBan();

		await fireEvent.click(button("Sign out"));

		expect(button("Sign out").getAttribute("aria-busy")).toBe("true");
		expect(button("Sign out").matches(":disabled")).toBe(true);
		expect(button("Copy details").matches(":disabled")).toBe(true);

		signOut.resolve();
		await vi.waitFor(() => expect(accountStatusState.open).toBe(false));
	});

	it("swallows the back gesture while open", async () => {
		await showBan();

		expect(backGestureEventHandlers.size).toBe(1);
		for (const handler of backGestureEventHandlers) handler();

		expect(accountStatusState.open).toBe(true);
	});
});
