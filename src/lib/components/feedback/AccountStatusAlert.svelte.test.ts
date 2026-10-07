// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accountStatusState } from "$lib/api/account-status-state.svelte";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import AccountStatusAlert from "./AccountStatusAlert.svelte";

const { callMethodMock, tauriListeners, toastSuccessMock, writeTextMock } =
	vi.hoisted(() => ({
		callMethodMock: vi.fn(),
		tauriListeners: new Map<
			string,
			(event: { payload: unknown }) => void
		>(),
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
vi.mock("svelte-sonner", () => ({ toast: { success: toastSuccessMock } }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
	writeText: writeTextMock,
}));

const ban = { kind: "BANNED", code: 403, message: "Account banned" };

const descriptionWithoutReason =
	"Grindr has banned this account. You can't sign in until the ban is lifted.";

function emit(event: string, payload: unknown) {
	tauriListeners.get(event)?.({ payload });
}

async function renderAlert() {
	render(AccountStatusAlert);
	await vi.waitFor(() => {
		expect(tauriListeners.has("auth:banned")).toBe(true);
		expect(tauriListeners.has("auth:restriction")).toBe(true);
	});
}

function dialogText(slot: "title" | "description") {
	return screen
		.getByRole("alertdialog")
		.querySelector(`[data-slot="alert-dialog-${slot}"]`)?.textContent;
}

beforeEach(() => {
	callMethodMock.mockResolvedValue(null);
	writeTextMock.mockResolvedValue(undefined);
});

afterEach(async () => {
	cleanup();
	vi.clearAllMocks();
	tauriListeners.clear();
	accountStatusState.open = false;
	accountStatusState.status = null;
	await setLocale({ locale: SOURCE_LOCALE });
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

	it.each([
		{
			reason: "spam",
			description:
				"Grindr has banned this account (spam). You can't sign in until the ban is lifted.",
		},
		{ reason: null, description: descriptionWithoutReason },
		{ reason: undefined, description: descriptionWithoutReason },
		{ reason: "", description: descriptionWithoutReason },
	])(
		"explains a ban whose reason is $reason",
		async ({ reason, description }) => {
			await renderAlert();

			emit("auth:banned", { ...ban, reason });

			await screen.findByRole("alertdialog");
			expect(dialogText("title")).toBe("Your account is banned");
			expect(dialogText("description")).toBe(description);
		},
	);

	it.each([
		{
			status: "a ban",
			event: "auth:banned",
			payload: { ...ban, reason: "spam" },
			buttons: ["Copy details", "Sign out"],
		},
		{
			status: "an age check",
			event: "auth:restriction",
			payload: { kind: "ageVerification" },
			buttons: ["Sign out"],
		},
		{
			status: "a restriction",
			event: "auth:restriction",
			payload: { kind: "timedBan" },
			buttons: ["Sign out"],
		},
	])(
		"words $status in the active locale",
		async ({ event, payload, buttons }) => {
			await renderAlert();
			emit(event, payload);
			const shownButtons = await Promise.all(
				buttons.map((name) => screen.findByRole("button", { name })),
			);

			await setLocale({ locale: "en-XA" });

			const lines = [
				dialogText("title"),
				dialogText("description"),
				...shownButtons.map((button) => button.textContent),
			];
			expect(lines).toHaveLength(buttons.length + 2);
			for (const line of lines) expect(line).toMatch(PSEUDO_MESSAGE);
			expect(
				within(screen.getByRole("alertdialog")).getAllByRole("button"),
			).toStrictEqual(shownButtons);
		},
	);

	it("keeps the server's ban reason verbatim in a translated description", async () => {
		await renderAlert();
		await setLocale({ locale: "en-XA" });

		emit("auth:banned", { ...ban, reason: "spam" });

		await screen.findByRole("alertdialog");
		expect(dialogText("description")).toMatch(PSEUDO_MESSAGE);
		expect(dialogText("description")).toContain("(spam)");
	});

	it.each([
		{ locale: SOURCE_LOCALE, toast: "Details copied to clipboard" },
		{ locale: "en-XA", toast: expect.stringMatching(PSEUDO_MESSAGE) },
	])(
		"copies the ban details as English JSON under $locale",
		async ({ locale, toast }) => {
			const info = {
				...ban,
				reason: "spam",
				subReason: "automated review",
				automated: true,
			};
			await renderAlert();
			emit("auth:banned", info);
			const copyButton = await screen.findByRole("button", {
				name: "Copy details",
			});
			await setLocale({ locale });

			await fireEvent.click(copyButton);

			await vi.waitFor(() => {
				expect(toastSuccessMock).toHaveBeenCalledExactlyOnceWith(toast);
			});
			expect(writeTextMock).toHaveBeenCalledExactlyOnceWith(
				JSON.stringify(info, null, 2),
			);
		},
	);
});
