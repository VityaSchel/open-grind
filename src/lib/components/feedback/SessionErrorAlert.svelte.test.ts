// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
import { sessionErrorState } from "$lib/api/session-error-state.svelte";
import { sessionRecovery } from "$lib/api/session-recovery.svelte";
import SessionErrorAlert from "./SessionErrorAlert.svelte";

const {
	callMethodMock,
	signOutMock,
	tauriListeners,
	wsConnectedHandlers,
	toastErrorMock,
	toastSuccessMock,
	toastDismissMock,
	writeTextMock,
} = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	signOutMock: vi.fn(),
	tauriListeners: new Map<string, (event: { payload: unknown }) => void>(),
	wsConnectedHandlers: [] as (() => void)[],
	toastErrorMock: vi.fn(),
	toastSuccessMock: vi.fn(),
	toastDismissMock: vi.fn(),
	writeTextMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: (name: string, handler: (event: { payload: unknown }) => void) => {
		tauriListeners.set(name, handler);
		return Promise.resolve(() => tauriListeners.delete(name));
	},
}));
vi.mock("$lib/ws.svelte", () => ({
	ws: {
		onConnected: (handler: () => void) => {
			wsConnectedHandlers.push(handler);
			return Promise.resolve(() => {});
		},
	},
}));
vi.mock("$lib/api/sign-out", () => ({ signOut: signOutMock }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
	writeText: writeTextMock,
}));
vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("svelte-sonner", () => ({
	toast: {
		error: toastErrorMock,
		success: toastSuccessMock,
		dismiss: toastDismissMock,
	},
}));

function emit(event: string, payload: unknown) {
	tauriListeners.get(event)?.({ payload });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("SessionErrorAlert", () => {
	beforeEach(() => {
		callMethodMock
			.mockReset()
			.mockResolvedValue({ signedIn: true, expiresAt: 0, stale: true });
		signOutMock.mockReset().mockResolvedValue(undefined);
		toastErrorMock.mockReset();
		writeTextMock.mockReset().mockResolvedValue(undefined);
		tauriListeners.clear();
		wsConnectedHandlers.length = 0;
		sessionRecovery.recover();
		Object.defineProperty(document, "visibilityState", {
			value: "visible",
			configurable: true,
		});
		sessionErrorState.open = true;
		sessionErrorState.message = "connection reset";
		requestBlockedAlertState.open = false;
		requestBlockedAlertState.disable = false;
	});

	afterEach(() => {
		cleanup();
		requestBlockedAlertState.open = false;
		requestBlockedAlertState.disable = false;
	});

	it("takes the dialog back down when the session recovers on its own", () => {
		render(SessionErrorAlert);
		expect(sessionErrorState.open).toBe(true);

		emit("auth:session-ok", null);

		expect(sessionErrorState.open).toBe(false);
		expect(signOutMock).not.toHaveBeenCalled();
	});

	it("takes the dialog back down once the websocket reconnects", () => {
		render(SessionErrorAlert);

		for (const handler of wsConnectedHandlers) handler();

		expect(sessionErrorState.open).toBe(false);
	});

	it("reports how many attempts were made before giving up", async () => {
		sessionErrorState.open = false;
		render(SessionErrorAlert);

		emit("auth:session-error", {
			message: "connection reset",
			unauthorized: false,
			kind: "Api",
			attempts: 3,
			transient: true,
		});
		await settle();

		expect(
			screen.getByText("connection reset (after 3 attempts)"),
		).toBeTruthy();
	});

	it("says attempt in the singular", async () => {
		sessionErrorState.open = false;
		render(SessionErrorAlert);

		emit("auth:session-error", {
			message: "connection reset",
			unauthorized: false,
			kind: "Api",
			attempts: 1,
			transient: true,
		});
		await settle();

		expect(
			screen.getByText("connection reset (after 1 attempt)"),
		).toBeTruthy();
	});

	it("can be dismissed", async () => {
		render(SessionErrorAlert);

		await fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

		expect(sessionErrorState.open).toBe(false);
	});

	it("signs out on a session the server revoked", async () => {
		sessionErrorState.open = false;
		render(SessionErrorAlert);

		emit("auth:session-error", {
			message: "Session expired",
			unauthorized: true,
			kind: "Unauthorized",
			attempts: 0,
		});
		await settle();

		expect(signOutMock).toHaveBeenCalledOnce();
		expect(sessionErrorState.open).toBe(false);
	});

	it("does not raise a dialog for an unreachable network", async () => {
		sessionErrorState.open = false;
		render(SessionErrorAlert);

		emit("auth:session-error", {
			message: "connection reset",
			unauthorized: false,
			kind: "Http",
			attempts: 3,
		});
		await settle();

		expect(sessionErrorState.open).toBe(false);
		expect(toastErrorMock).toHaveBeenCalled();
	});

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

	it("shows a bounded excerpt of a huge error but copies all of it", async () => {
		sessionErrorState.message = "x".repeat(400);
		render(SessionErrorAlert);

		await fireEvent.click(
			screen.getByRole("button", { name: "Copy error" }),
		);

		expect(
			screen.getByText(`${"x".repeat(200)}…<+200 chars>`),
		).toBeTruthy();
		await vi.waitFor(() => {
			expect(writeTextMock).toHaveBeenCalledWith("x".repeat(400));
		});
	});

	it("keeps the attempt count visible on a huge error", async () => {
		sessionErrorState.open = false;
		render(SessionErrorAlert);

		emit("auth:session-error", {
			message: "x".repeat(400),
			unauthorized: false,
			kind: "Api",
			attempts: 3,
			transient: true,
		});
		await settle();

		expect(
			screen.getByText(
				`${"x".repeat(200)}…<+200 chars> (after 3 attempts)`,
			),
		).toBeTruthy();
	});

	it("summarizes a web page the refresh got instead of data", () => {
		sessionErrorState.message =
			"<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body>Ray ID</body></html>";
		render(SessionErrorAlert);

		expect(
			screen.getByText(
				'The server returned a web page: "Attention Required! | Cloudflare"',
			),
		).toBeTruthy();
		expect(screen.queryByText(/Ray ID/)).toBeNull();
	});

	it("leaves a blocked retry to the request-blocked dialog", async () => {
		callMethodMock.mockRejectedValue({ kind: "RequestBlocked" });
		render(SessionErrorAlert);

		await fireEvent.click(
			screen.getByRole("button", { name: "Try again" }),
		);

		expect(requestBlockedAlertState.open).toBe(true);
		expect(toastErrorMock).not.toHaveBeenCalled();
		expect(sessionErrorState.open).toBe(true);
	});

	it("toasts a blocked retry once the dialog is muted for the session", async () => {
		requestBlockedAlertState.disable = true;
		callMethodMock.mockRejectedValue({ kind: "RequestBlocked" });
		render(SessionErrorAlert);

		await fireEvent.click(
			screen.getByRole("button", { name: "Try again" }),
		);

		expect(requestBlockedAlertState.open).toBe(false);
		expect(toastErrorMock).toHaveBeenCalledExactlyOnceWith(
			"Grindr is blocking your requests",
		);
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
		expect(toastErrorMock).toHaveBeenCalled();
	});
});
