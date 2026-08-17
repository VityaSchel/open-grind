// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
import SignInForm from "./SignInForm.svelte";

const { callMethodMock, gotoMock, toastMock } = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	gotoMock: vi.fn(),
	toastMock: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("$app/navigation", () => ({ goto: gotoMock }));
vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function submitSignIn() {
	await fireEvent.input(screen.getByLabelText("Email"), {
		target: { value: "someone@example.com" },
	});
	await fireEvent.input(screen.getByLabelText("Password"), {
		target: { value: "hunter2" },
	});
	await fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
	await settle();
}

describe("SignInForm", () => {
	beforeEach(() => {
		callMethodMock.mockReset();
		gotoMock.mockReset();
		toastMock.error.mockReset();
		requestBlockedAlertState.open = false;
		requestBlockedAlertState.disable = false;
		requestBlockedAlertState.kind = "cloudflare";
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		requestBlockedAlertState.open = false;
		requestBlockedAlertState.disable = false;
	});

	it("raises the dialog instead of a toast when Cloudflare blocks the sign-in", async () => {
		callMethodMock.mockRejectedValue({ kind: "RequestBlocked" });
		render(SignInForm);

		await submitSignIn();

		expect(requestBlockedAlertState.open).toBe(true);
		expect(requestBlockedAlertState.kind).toBe("cloudflare");
		expect(toastMock.error).not.toHaveBeenCalled();
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it("raises the dialog instead of a toast when an edge blocks the sign-in", async () => {
		callMethodMock.mockRejectedValue({ kind: "NetworkBlocked" });
		render(SignInForm);

		await submitSignIn();

		expect(requestBlockedAlertState.open).toBe(true);
		expect(requestBlockedAlertState.kind).toBe("network");
		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it("falls back to a toast when the dialog is muted for the session", async () => {
		requestBlockedAlertState.disable = true;
		callMethodMock.mockRejectedValue({ kind: "RequestBlocked" });
		render(SignInForm);

		await submitSignIn();

		expect(requestBlockedAlertState.open).toBe(false);
		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Grindr is blocking your requests",
		);
	});

	it("raises the dialog instead of a toast when a block kills Google sign-in", async () => {
		callMethodMock.mockRejectedValue({ kind: "RequestBlocked" });
		render(SignInForm);

		await fireEvent.click(
			screen.getByRole("button", { name: "Sign in with Google" }),
		);
		await settle();

		expect(requestBlockedAlertState.open).toBe(true);
		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it("falls back to a toast when a muted block kills Google sign-in", async () => {
		requestBlockedAlertState.disable = true;
		callMethodMock.mockRejectedValue({ kind: "NetworkBlocked" });
		render(SignInForm);

		await fireEvent.click(
			screen.getByRole("button", { name: "Sign in with Google" }),
		);
		await settle();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Something blocked the request before it reached Grindr",
		);
	});

	it("still reports an ordinary API failure", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Api",
			message: { code: 9, message: "Something broke" },
		});
		render(SignInForm);

		await submitSignIn();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Error 9: Something broke",
		);
	});

	it("still reports wrong credentials", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Api",
			message: { code: 4, message: "Invalid input parameters" },
		});
		render(SignInForm);

		await submitSignIn();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Invalid email or password",
		);
	});
});
