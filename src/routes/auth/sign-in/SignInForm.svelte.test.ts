// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
import {
	refusedCompanionMessage,
	untrustedCompanionMessage,
} from "$lib/api/sign-in";
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

	it.each(["Google", "Facebook"])(
		"names the official app when %s sign-in hits an unregistered account",
		async (vendor) => {
			callMethodMock.mockRejectedValue({
				kind: "Auth",
				message: "account not registered",
			});
			render(SignInForm);

			await fireEvent.click(
				screen.getByRole("button", { name: `Sign in with ${vendor}` }),
			);
			await settle();

			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
				"Account not registered in Grindr. Register first using the official Grindr app",
			);
			expect(gotoMock).not.toHaveBeenCalled();
		},
	);

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

	it("sends a missing Google OAuth app to the Google sign-in screen", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-unavailable",
		});
		render(SignInForm);

		await fireEvent.click(
			screen.getByRole("button", { name: "Sign in with Google" }),
		);
		await settle();

		expect(gotoMock).toHaveBeenCalledExactlyOnceWith(
			"/auth/sign-in/google",
		);
		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it("stays on the sign-in screen when the Google OAuth app is turned off", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-disabled",
		});
		render(SignInForm);

		await fireEvent.click(
			screen.getByRole("button", { name: "Sign in with Google" }),
		);
		await settle();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"The Open Grind Google OAuth app is turned off. Turn it on in Android settings, then try again.",
		);
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it("sends an untrusted Google OAuth app straight to the pasted token", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-untrusted",
		});
		render(SignInForm);

		await fireEvent.click(
			screen.getByRole("button", { name: "Sign in with Google" }),
		);
		await settle();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			untrustedCompanionMessage,
		);
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith(
			"/auth/sign-in/google?paste",
		);
	});

	it("sends a Google OAuth app that refuses this build straight to the pasted token", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-refused",
		});
		render(SignInForm);

		await fireEvent.click(
			screen.getByRole("button", { name: "Sign in with Google" }),
		);
		await settle();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			refusedCompanionMessage,
		);
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith(
			"/auth/sign-in/google?paste",
		);
	});

	it("keeps the password button's name while it signs in", async () => {
		callMethodMock.mockReturnValue(new Promise(() => {}));
		render(SignInForm);

		await submitSignIn();

		const busy = screen.getByRole("button", { name: "Sign in" });
		expect(busy.getAttribute("aria-busy")).toBe("true");
		expect(
			screen
				.getByRole("button", { name: "Sign in with Google" })
				.getAttribute("aria-busy"),
		).toBe("false");
	});

	it.each(["Google", "Facebook"])(
		"keeps the %s button's name while it signs in",
		async (vendor) => {
			callMethodMock.mockReturnValue(new Promise(() => {}));
			render(SignInForm);
			const name = `Sign in with ${vendor}`;

			await fireEvent.click(screen.getByRole("button", { name }));
			await settle();

			const busy = screen.getByRole("button", { name });
			expect(busy).toHaveProperty("disabled", true);
			expect(busy.getAttribute("aria-busy")).toBe("true");
			expect(screen.queryByRole("status")).toBeNull();
		},
	);

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
