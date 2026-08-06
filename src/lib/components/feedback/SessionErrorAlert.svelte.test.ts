// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionErrorState } from "$lib/api/session-error-state.svelte";
import SessionErrorAlert from "./SessionErrorAlert.svelte";

const { callMethodMock, signOutMock } = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	signOutMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: () => Promise.resolve(() => {}),
}));
vi.mock("$lib/api/sign-out", () => ({ signOut: signOutMock }));
vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));

describe("SessionErrorAlert", () => {
	beforeEach(() => {
		callMethodMock.mockReset();
		signOutMock.mockReset().mockResolvedValue(undefined);
		sessionErrorState.open = true;
		sessionErrorState.message = "connection reset";
	});

	afterEach(cleanup);

	it("closes on a refresh that succeeds", async () => {
		callMethodMock.mockResolvedValue({ profileId: 1, restriction: null });
		render(SessionErrorAlert);

		await fireEvent.click(
			screen.getByRole("button", { name: "Try again" }),
		);

		expect(signOutMock).not.toHaveBeenCalled();
		expect(sessionErrorState.open).toBe(false);
	});

	it("signs out instead of retrying forever once the session is gone", async () => {
		callMethodMock.mockRejectedValue({ kind: "NotLoggedIn" });
		render(SessionErrorAlert);

		await fireEvent.click(
			screen.getByRole("button", { name: "Try again" }),
		);

		expect(signOutMock).toHaveBeenCalledOnce();
		expect(sessionErrorState.open).toBe(false);
	});

	it("stays open when the refresh fails for another reason", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Http",
			message: "timed out",
		});
		render(SessionErrorAlert);

		await fireEvent.click(
			screen.getByRole("button", { name: "Try again" }),
		);

		expect(signOutMock).not.toHaveBeenCalled();
		expect(sessionErrorState.open).toBe(true);
	});
});
