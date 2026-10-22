// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	accountStatusState,
	showAccountStatusForApiError,
} from "$lib/api/account-status-state.svelte";
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
		for (const handler of backGestureEventHandlers.keys()) handler();

		expect(accountStatusState.open).toBe(true);
	});
});

describe("account status variants", () => {
	async function showBanned(info: Record<string, unknown>) {
		render(AccountStatusAlert);
		await vi.waitFor(() => {
			expect(tauriListeners.has("auth:banned")).toBe(true);
		});
		emit("auth:banned", { kind: "profile", message: "Banned", ...info });
		return await screen.findByRole("alertdialog");
	}

	const link = (name: string) =>
		screen.getByRole("link", { name }).getAttribute("href");

	it("explains a permanent ban with its sub-reason, Learn more and Appeal", async () => {
		const dialog = await showBanned({
			code: 27,
			reason: "Scam / Spam",
			subReason: "PHISHING_AND_FRAUD",
		});

		expect(dialog.textContent).toContain(
			"Grindr banned this account (Phishing, fraud, and harmful links).",
		);
		expect(link("Learn more")).toMatch(
			/^https:\/\/help\.grindr\.com\/hc\/[a-z]+\/articles\/1500009296922-Banned-profiles$/,
		);
		expect(link("Appeal")).toBe("https://web.grindr.com/ban-appeal");
		expect(button("Copy details")).toBeTruthy();
	});

	it("offers no appeal for a ban Grindr made through its block decision", async () => {
		const dialog = await showBanned({
			code: 27,
			reason: "TRUST_VENDOR_REJECTED",
			subReason: "BLOCK_DECISION",
		});

		expect(dialog.textContent).toContain("Grindr banned this account.");
		expect(screen.queryByRole("link", { name: "Appeal" })).toBeNull();
	});

	it("tells a blocked network apart from a ban", async () => {
		const dialog = await showBanned({ kind: "network", code: 31 });

		expect(screen.getByRole("heading").textContent).toBe("Network blocked");
		expect(dialog.textContent).not.toContain("banned");
		expect(
			screen.queryByRole("button", { name: "Copy details" }),
		).toBeNull();

		await fireEvent.click(button("OK"));
		expect(signOutMock).toHaveBeenCalledOnce();
	});

	it("reports a failed security check for code 28", async () => {
		await showBanned({ kind: "device", code: 28 });

		expect(screen.getByRole("heading").textContent).toBe(
			"Security check failed",
		);
		expect(button("Copy details")).toBeTruthy();
	});

	it("links age verification for an underage restriction", async () => {
		await showBanned({ kind: "underage", code: 35 });

		expect(screen.getByRole("heading").textContent).toBe("Age restricted");
		expect(link("Verify age")).toMatch(/\/articles\/4417616146963$/);
	});

	async function showTimedBan(subReason: string) {
		render(AccountStatusAlert);
		await vi.waitFor(() => {
			expect(tauriListeners.has("auth:restriction")).toBe(true);
		});
		emit("auth:restriction", {
			kind: "timedBan",
			reason: "Scam / Spam",
			subReason,
			endsAt: new Date(2026, 9, 25, 14, 0).getTime(),
		});
		return await screen.findByRole("alertdialog");
	}

	it("says until when a timed ban suspends the account", async () => {
		vi.useFakeTimers({ now: new Date(2026, 9, 22, 12), toFake: ["Date"] });

		const dialog = await showTimedBan("PROFILE_SPAM");

		expect(screen.getByRole("heading").textContent).toBe(
			"Account suspended",
		);
		expect(dialog.textContent).toContain(
			"Grindr suspended this account (Profile spam and advertising) until Oct 25, 14:00.",
		);
		expect(screen.queryByRole("link", { name: "Appeal" })).toBeNull();
		vi.useRealTimers();
	});

	it("offers an appeal only for timed bans Grindr lets users appeal", async () => {
		await showTimedBan("DRUG_SALES");

		expect(link("Appeal")).toBe("https://web.grindr.com/ban-appeal");
	});

	it("lets phone verification be dismissed without signing out", async () => {
		render(AccountStatusAlert);
		showAccountStatusForApiError({
			code: 30,
			message: "Verification required",
		});
		await screen.findByRole("alertdialog");

		await fireEvent.click(button("OK"));

		expect(accountStatusState.open).toBe(false);
		expect(signOutMock).not.toHaveBeenCalled();
	});

	it("closes phone verification on the back gesture", async () => {
		render(AccountStatusAlert);
		showAccountStatusForApiError({
			code: 30,
			message: "Verification required",
		});
		await screen.findByRole("alertdialog");

		for (const handler of backGestureEventHandlers.keys()) handler();

		expect(accountStatusState.open).toBe(false);
	});
});
