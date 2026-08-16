// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
import { sessionErrorState } from "$lib/api/session-error-state.svelte";
import {
	type SessionErrorReport,
	sessionRecovery,
} from "$lib/api/session-recovery.svelte";

const { callMethodMock, toastErrorMock, toastDismissMock } = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	toastErrorMock: vi.fn(),
	toastDismissMock: vi.fn(),
}));

vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("svelte-sonner", () => ({
	toast: { error: toastErrorMock, dismiss: toastDismissMock },
}));

function setVisibility(state: "visible" | "hidden") {
	Object.defineProperty(document, "visibilityState", {
		value: state,
		configurable: true,
	});
	document.dispatchEvent(new Event("visibilitychange"));
}

function report(overrides: Partial<SessionErrorReport> = {}) {
	sessionRecovery.report({
		message: "connection reset",
		unauthorized: false,
		kind: "Auth",
		attempts: 3,
		transient: true,
		...overrides,
	});
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("sessionRecovery", () => {
	beforeEach(() => {
		callMethodMock
			.mockReset()
			.mockResolvedValue({ signedIn: true, expiresAt: 0, stale: true });
		toastErrorMock.mockReset();
		toastDismissMock.mockReset();
		requestBlockedAlertState.open = false;
		sessionRecovery.recover();
		setVisibility("visible");
	});

	it("raises a refusal from Grindr as a blocking dialog", async () => {
		report({ kind: "Auth" });
		await settle();

		expect(sessionErrorState.open).toBe(true);
		expect(sessionErrorState.message).toBe("connection reset");
		expect(sessionErrorState.attempts).toBe(3);
	});

	it("retracts the dialog when a later refresh succeeds", async () => {
		report({ kind: "Auth" });
		await settle();
		expect(sessionErrorState.open).toBe(true);

		sessionRecovery.recover();

		expect(sessionErrorState.open).toBe(false);
		expect(sessionErrorState.message).toBe("");
	});

	it("demotes an unreachable network to a toast", async () => {
		report({ kind: "Http" });
		await settle();

		expect(sessionErrorState.open).toBe(false);
		expect(toastErrorMock).toHaveBeenCalledOnce();
	});

	it("routes an edge block to the request-blocked alert", async () => {
		report({ kind: "RequestBlocked" });
		await settle();

		expect(requestBlockedAlertState.open).toBe(true);
		expect(sessionErrorState.open).toBe(false);
	});

	it("shows nothing while the app is backgrounded, then promotes on resume", async () => {
		setVisibility("hidden");

		report({ kind: "Auth" });
		await settle();
		expect(sessionErrorState.open).toBe(false);

		setVisibility("visible");
		await settle();
		expect(sessionErrorState.open).toBe(true);
	});

	it("drops a failure another caller already repaired", async () => {
		callMethodMock.mockResolvedValue({
			signedIn: true,
			expiresAt: 9_999_999_999,
			stale: false,
		});

		report({ kind: "Auth" });
		await settle();

		expect(sessionErrorState.open).toBe(false);
	});

	it("drops a report that describes a network the app has left behind", async () => {
		setVisibility("hidden");
		report({ kind: "Auth" });

		vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120_000);
		setVisibility("visible");
		await settle();
		vi.mocked(Date.now).mockRestore();

		expect(sessionErrorState.open).toBe(false);
	});

	it("never defers a permanent failure behind the staleness filter", () => {
		callMethodMock.mockResolvedValue({
			signedIn: true,
			expiresAt: 9_999_999_999,
			stale: false,
		});

		report({ kind: "Auth", transient: false });

		expect(sessionErrorState.open).toBe(true);
		expect(callMethodMock).not.toHaveBeenCalled();
	});

	it("honors the user's opt-out of the blocked-request alert", async () => {
		requestBlockedAlertState.disable = true;

		report({ kind: "RequestBlocked" });
		await settle();

		expect(requestBlockedAlertState.open).toBe(false);
		requestBlockedAlertState.disable = false;
	});

	it("takes the blocked-request alert back down on recovery", async () => {
		report({ kind: "RequestBlocked" });
		await settle();
		expect(requestBlockedAlertState.open).toBe(true);

		sessionRecovery.recover();

		expect(requestBlockedAlertState.open).toBe(false);
	});

	it("keeps a dismissed dialog down when the same failure repeats", async () => {
		report({ kind: "Auth" });
		await settle();
		expect(sessionErrorState.open).toBe(true);

		sessionRecovery.dismiss();
		expect(sessionErrorState.open).toBe(false);

		report({ kind: "Auth" });
		await settle();

		expect(sessionErrorState.open).toBe(false);
	});

	it("never defers a revoked session", () => {
		setVisibility("hidden");

		report({ kind: "Unauthorized", unauthorized: true });

		expect(sessionErrorState.open).toBe(true);
		expect(callMethodMock).not.toHaveBeenCalled();
	});
});
