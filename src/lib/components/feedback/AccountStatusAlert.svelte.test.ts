// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	accountStatusState,
	showAccountStatusForError,
} from "$lib/api/account-status-state.svelte";
import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import type { AccountStatusError } from "$lib/model/authentication";
import AccountStatusAlert from "./AccountStatusAlert.svelte";

const {
	callMethodMock,
	signOutMock,
	checkForUpdatesNowMock,
	updater,
	tauriListeners,
} = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	signOutMock: vi.fn(),
	checkForUpdatesNowMock: vi.fn<() => Promise<void>>(),
	updater: { selfManaged: false },
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
vi.mock("$lib/updates/capability.svelte", () => ({
	updatesSelfManaged: () => updater.selfManaged,
}));
vi.mock("$lib/updates/update-checks", () => ({
	checkForUpdatesNow: checkForUpdatesNowMock,
}));

const verificationRequired = {
	code: 30,
	message: "Verification required",
} as const;
const deprecatedVersion = {
	code: 8,
	message: "The client version is deprecated",
} as const;

function emit(event: string, payload: unknown) {
	tauriListeners.get(event)?.({ payload });
}

async function showOn(event: string, payload: unknown) {
	render(AccountStatusAlert);
	emit(event, payload);
	return await screen.findByRole("alertdialog");
}

function showBanned(info: Record<string, unknown> = {}) {
	return showOn("auth:banned", {
		kind: "profile",
		code: 27,
		message: "Banned",
		...info,
	});
}

async function showError(error: AccountStatusError) {
	render(AccountStatusAlert);
	showAccountStatusForError(error);
	return await screen.findByRole("alertdialog");
}

function swipeBack() {
	for (const handler of backGestureEventHandlers.keys()) handler();
}

const button = (name: string) => screen.getByRole("button", { name });
const heading = () => screen.getByRole("heading").textContent;
const link = (name: string) =>
	screen.getByRole("link", { name }).getAttribute("href");

beforeEach(() => {
	callMethodMock.mockResolvedValue(null);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	tauriListeners.clear();
	clearAccountCaches();
	resetNowForTesting();
	updater.selfManaged = false;
});

describe("AccountStatusAlert", () => {
	it("shows the restriction pushed after a relaunch mints the first token", async () => {
		await showOn("auth:restriction", {
			kind: "ageVerification",
			region: "GB",
			reason: "age_verification_required",
		});

		expect(heading()).toBe("Age verification required");
	});

	it("ignores a malformed restriction payload", () => {
		render(AccountStatusAlert);

		emit("auth:restriction", { unexpected: true });

		expect(accountStatusState.open).toBe(false);
	});

	it("marks Sign out busy and locks both buttons while signing out", async () => {
		const signOut = Promise.withResolvers<void>();
		signOutMock.mockReturnValueOnce(signOut.promise);
		await showBanned();

		await fireEvent.click(button("Sign out"));

		expect(button("Sign out").getAttribute("aria-busy")).toBe("true");
		expect(button("Sign out").matches(":disabled")).toBe(true);
		expect(button("Copy details").matches(":disabled")).toBe(true);

		signOut.resolve();
		await vi.waitFor(() => expect(accountStatusState.open).toBe(false));
	});

	it("swallows the back gesture while open", async () => {
		await showBanned();

		expect(backGestureEventHandlers.size).toBe(1);
		swipeBack();

		expect(accountStatusState.open).toBe(true);
	});
});

describe("bans and restrictions", () => {
	it("explains a permanent ban with its sub-reason, Learn more and Appeal", async () => {
		const dialog = await showBanned({
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
			reason: "TRUST_VENDOR_REJECTED",
			subReason: "BLOCK_DECISION",
		});

		expect(dialog.textContent).toContain("Grindr banned this account.");
		expect(screen.queryByRole("link", { name: "Appeal" })).toBeNull();
	});

	it("tells a blocked network apart from a ban", async () => {
		const dialog = await showBanned({ kind: "network", code: 31 });

		expect(heading()).toBe("Network blocked");
		expect(dialog.textContent).not.toContain("banned");
		expect(
			screen.queryByRole("button", { name: "Copy details" }),
		).toBeNull();

		await fireEvent.click(button("OK"));
		expect(signOutMock).toHaveBeenCalledOnce();
	});

	it("reports a failed security check for a device ban", async () => {
		await showBanned({ kind: "device", code: 28 });

		expect(heading()).toBe("Security check failed");
		expect(button("Copy details")).toBeTruthy();
	});

	it("links age verification for a teen underage ban", async () => {
		await showBanned({ kind: "underage", code: 35 });

		expect(heading()).toBe("Age restricted");
		expect(link("Verify age")).toMatch(/\/articles\/4417616146963$/);
	});

	it("shows a child underage ban as a plain ban", async () => {
		await showBanned({ kind: "underage", code: 36 });

		expect(heading()).toBe("Account banned");
	});

	function showTimedBan(subReason: string) {
		return showOn("auth:restriction", {
			kind: "timedBan",
			reason: "Scam / Spam",
			subReason,
			endsAt: new Date(2026, 9, 25, 14, 0).getTime(),
		});
	}

	it("says until when a timed ban suspends the account", async () => {
		setNowForTesting(() => new Date(2026, 9, 22, 12).getTime());

		const dialog = await showTimedBan("PROFILE_SPAM");

		expect(heading()).toBe("Account suspended");
		expect(dialog.textContent).toContain(
			"Grindr suspended this account (Profile spam and advertising) until Oct 25, 14:00.",
		);
		expect(screen.queryByRole("link", { name: "Appeal" })).toBeNull();
	});

	it("offers an appeal only for timed bans Grindr lets users appeal", async () => {
		await showTimedBan("DRUG_SALES");

		expect(link("Appeal")).toBe("https://web.grindr.com/ban-appeal");
	});
});

describe("phone verification", () => {
	it("can be dismissed without signing out", async () => {
		await showError(verificationRequired);

		await fireEvent.click(button("OK"));

		expect(accountStatusState.open).toBe(false);
		expect(signOutMock).not.toHaveBeenCalled();
	});

	it("closes on the back gesture", async () => {
		await showError(verificationRequired);

		swipeBack();

		expect(accountStatusState.open).toBe(false);
	});
});

describe("unsupported app version", () => {
	it("asks to update Open Grind", async () => {
		const dialog = await showError(deprecatedVersion);

		expect(heading()).toBe("Update Open Grind");
		expect(dialog.textContent).toContain(
			"Grindr no longer supports this version of Open Grind.",
		);
		expect(button("Copy details")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
	});

	it("runs the update check and stays open while its toasts take over", async () => {
		updater.selfManaged = true;
		const check = Promise.withResolvers<void>();
		checkForUpdatesNowMock.mockReturnValueOnce(check.promise);
		await showError(deprecatedVersion);

		await fireEvent.click(button("Check for updates"));

		expect(checkForUpdatesNowMock).toHaveBeenCalledExactlyOnceWith({
			selfManaged: true,
			addonAvailable: false,
		});
		expect(button("Check for updates").getAttribute("aria-busy")).toBe(
			"true",
		);
		expect(button("Copy details").matches(":disabled")).toBe(true);

		check.resolve();
		await vi.waitFor(() =>
			expect(button("Check for updates").getAttribute("aria-busy")).toBe(
				"false",
			),
		);
		expect(accountStatusState.open).toBe(true);
	});

	it("links the download page where the app can't update itself", async () => {
		await showError(deprecatedVersion);

		expect(link("Check for updates")).toBe(
			"https://opengrind.org/guides/download",
		);
	});

	it("can be dismissed with the back gesture", async () => {
		await showError(deprecatedVersion);

		swipeBack();

		expect(accountStatusState.open).toBe(false);
	});

	it("opens from a refused session refresh once and stays closed after it is dismissed", async () => {
		const refusedRefresh = { kind: "Api", message: deprecatedVersion };
		await showOn("auth:unsupported-version", refusedRefresh);

		swipeBack();
		emit("auth:unsupported-version", refusedRefresh);

		expect(accountStatusState.open).toBe(false);
	});
});
