// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	accountStatusState,
	showAccountStatusForError,
} from "$lib/api/account-status-state.svelte";
import { setLocale, setRegionalSettings, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { webRegionalSettings } from "$lib/i18n/regional";
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
	toastErrorMock,
	toastSuccessMock,
	writeTextMock,
} = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	signOutMock: vi.fn(),
	checkForUpdatesNowMock: vi.fn<() => Promise<void>>(),
	updater: { selfManaged: false },
	tauriListeners: new Map<string, (event: { payload: unknown }) => void>(),
	toastErrorMock: vi.fn(),
	toastSuccessMock: vi.fn(),
	writeTextMock: vi.fn(),
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
vi.mock("svelte-sonner", () => ({
	toast: { success: toastSuccessMock, error: toastErrorMock },
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
	writeText: writeTextMock,
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
const banned = { kind: "profile", code: 27, message: "Banned" };
const suspensionEnd = new Date(2026, 9, 25, 14, 0).getTime();

function emit(event: string, payload: unknown) {
	tauriListeners.get(event)?.({ payload });
}

async function showOn(event: string, payload: unknown) {
	render(AccountStatusAlert);
	emit(event, payload);
	return await screen.findByRole("alertdialog");
}

function showBanned(info: Record<string, unknown> = {}) {
	return showOn("auth:banned", { ...banned, ...info });
}

function showTimedBan(restriction: Record<string, unknown>) {
	return showOn("auth:restriction", {
		kind: "timedBan",
		reason: "Scam / Spam",
		...restriction,
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

function dialogText(slot: "title" | "description") {
	return screen
		.getByRole("alertdialog")
		.querySelector(`[data-slot="alert-dialog-${slot}"]`)
		?.textContent.trim();
}

const button = (name: string) => screen.getByRole("button", { name });
const heading = () => screen.getByRole("heading").textContent;
const link = (name: string) =>
	screen.getByRole("link", { name }).getAttribute("href");
const actions = () => [
	...screen
		.getByRole("alertdialog")
		.querySelectorAll<HTMLElement>(
			'[data-slot="alert-dialog-footer"] :is(button, a)',
		),
];

beforeEach(() => {
	callMethodMock.mockResolvedValue(null);
	writeTextMock.mockResolvedValue(undefined);
});

afterEach(async () => {
	cleanup();
	vi.clearAllMocks();
	tauriListeners.clear();
	clearAccountCaches();
	resetNowForTesting();
	updater.selfManaged = false;
	setRegionalSettings(webRegionalSettings());
	await setLocale({ locale: SOURCE_LOCALE });
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

	it.each([
		{ locale: SOURCE_LOCALE, toast: "Copied to clipboard" },
		{ locale: "en-XA", toast: expect.stringMatching(PSEUDO_MESSAGE) },
	])(
		"copies the ban details as English JSON under $locale",
		async ({ locale, toast }) => {
			const info = {
				...banned,
				reason: "Scam / Spam",
				subReason: "PHISHING_AND_FRAUD",
			};
			await showBanned(info);
			const copyButton = button("Copy details");
			await setLocale({ locale });

			await fireEvent.click(copyButton);

			await vi.waitFor(() => {
				expect(toastSuccessMock).toHaveBeenCalledExactlyOnceWith(toast);
			});
			expect(writeTextMock).toHaveBeenCalledExactlyOnceWith(
				JSON.stringify(info, null, 2),
			);
			expect(toastErrorMock).not.toHaveBeenCalled();
		},
	);

	it("reports a copy the clipboard refuses instead of claiming it copied", async () => {
		writeTextMock.mockRejectedValue(new Error("no clipboard"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		await showError(deprecatedVersion);

		await fireEvent.click(button("Copy details"));

		await vi.waitFor(() => {
			expect(toastErrorMock).toHaveBeenCalledExactlyOnceWith(
				"Couldn’t copy to clipboard",
			);
		});
		expect(toastSuccessMock).not.toHaveBeenCalled();
	});
});

describe("bans and restrictions", () => {
	it("explains a permanent ban with its sub-reason, Learn more and Appeal", async () => {
		await showBanned({
			reason: "Scam / Spam",
			subReason: "PHISHING_AND_FRAUD",
		});

		expect(dialogText("description")).toBe(
			"Grindr banned this account (Phishing, fraud, and harmful links). Learn more",
		);
		expect(link("Learn more")).toMatch(
			/^https:\/\/help\.grindr\.com\/hc\/[a-z]+\/articles\/1500009296922-Banned-profiles$/,
		);
		expect(link("Appeal")).toBe("https://web.grindr.com/ban-appeal");
		expect(button("Copy details")).toBeTruthy();
	});

	it("never shows the server's own ban reason", async () => {
		await showBanned({ reason: "Scam / Spam" });

		expect(dialogText("description")).toBe(
			"Grindr banned this account. Learn more",
		);
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
		expect(dialogText("description")).toBe(
			"Couldn’t pass Grindr security check. Sign out and try again.",
		);
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

	it("says until when a timed ban suspends the account, in the system's 24-hour clock", async () => {
		setRegionalSettings({ locale: "en-US", hourCycle: "h23" });
		setNowForTesting(() => new Date(2026, 9, 22, 12).getTime());

		await showTimedBan({
			subReason: "PROFILE_SPAM",
			endsAt: suspensionEnd,
		});

		expect(heading()).toBe("Account suspended");
		expect(dialogText("description")).toBe(
			"Grindr suspended this account (Profile spam and advertising) until Oct 25, 14:00.",
		);
		expect(screen.queryByRole("link", { name: "Appeal" })).toBeNull();
	});

	it("writes the end of a suspension in the system's 12-hour clock and adds a later year", async () => {
		setRegionalSettings({ locale: "en-US", hourCycle: "h12" });
		setNowForTesting(() => new Date(2025, 11, 30, 12).getTime());

		await showTimedBan({ endsAt: suspensionEnd });

		expect(dialogText("description")).toBe(
			"Grindr suspended this account until Oct 25, 2026, 2:00 PM.",
		);
	});

	it.each([
		{
			subReason: "BOT_ACTIVITY",
			description:
				"Grindr suspended this account (Automated/bot activity).",
		},
		{ subReason: "Other", description: "Grindr suspended this account." },
	])(
		"explains a $subReason suspension without an end",
		async ({ subReason, description }) => {
			await showTimedBan({ subReason });

			expect(dialogText("description")).toBe(description);
		},
	);

	it("offers an appeal only for timed bans Grindr lets users appeal", async () => {
		await showTimedBan({ subReason: "DRUG_SALES", endsAt: suspensionEnd });

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

describe("in the active locale", () => {
	it.each([
		{
			popup: "a ban with its reason",
			show: () => showBanned({ subReason: "PHISHING_AND_FRAUD" }),
			actions: 3,
		},
		{
			popup: "a ban without a reason",
			show: () => showBanned(),
			actions: 3,
		},
		{
			popup: "a blocked network",
			show: () => showBanned({ kind: "network", code: 31 }),
			actions: 1,
		},
		{
			popup: "a failed security check",
			show: () => showBanned({ kind: "device", code: 28 }),
			actions: 2,
		},
		{
			popup: "an age restriction",
			show: () => showBanned({ kind: "underage", code: 35 }),
			actions: 2,
		},
		{
			popup: "an age check",
			show: () => showOn("auth:restriction", { kind: "ageVerification" }),
			actions: 1,
		},
		{
			popup: "a restriction",
			show: () => showOn("auth:restriction", { kind: "other" }),
			actions: 1,
		},
		{
			popup: "a suspension with its reason and end",
			show: () =>
				showTimedBan({
					subReason: "DRUG_SALES",
					endsAt: suspensionEnd,
				}),
			actions: 2,
		},
		{
			popup: "a suspension with its end",
			show: () => showTimedBan({ endsAt: suspensionEnd }),
			actions: 1,
		},
		{
			popup: "a suspension with its reason",
			show: () => showTimedBan({ subReason: "DRUG_SALES" }),
			actions: 2,
		},
		{ popup: "a suspension", show: () => showTimedBan({}), actions: 1 },
		{
			popup: "a required phone verification",
			show: () => showError(verificationRequired),
			actions: 2,
		},
		{
			popup: "an unsupported version",
			show: () => showError(deprecatedVersion),
			actions: 2,
		},
	])("words $popup", async ({ show, actions: count }) => {
		await show();

		await setLocale({ locale: "en-XA" });

		const lines = [
			dialogText("title"),
			dialogText("description"),
			...actions().map((action) => action.textContent.trim()),
		];
		expect(lines).toHaveLength(count + 2);
		for (const line of lines) expect(line).toMatch(PSEUDO_MESSAGE);
	});

	it("translates the ban reason inside the description", async () => {
		await showBanned({ subReason: "PHISHING_AND_FRAUD" });

		await setLocale({ locale: "en-XA" });

		expect(dialogText("description")).toMatch(/\(⟦[^⟧]+⟧\)/);
		expect(dialogText("description")).not.toContain("Phishing");
	});
});
