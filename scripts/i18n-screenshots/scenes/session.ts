import type { Page } from "@playwright/test";

import type {
	MethodFault,
	NativeError,
} from "../../../src/lib/demo/screenshot-scene";
import { showsLoading } from "../settle";
import type { Scene } from ".";
import { ALERT, changeScene, emitEvent } from "./drive";
import { holdToast } from "./toast";
import { visit } from "./visit";

const SHOWN_TOAST = '[data-sonner-toast][data-mounted="true"]';
const SIGN_IN_FAILURES = {
	server: [
		{ kind: "Api", message: { code: 27, message: "Profile not found" } },
		{ kind: "Http", message: "<html><body>Bad gateway</body></html>" },
		{
			kind: "Http",
			message:
				"<html><head><title>Service unavailable</title></head></html>",
		},
	],
	app: [
		{ kind: "NotSignedIn" },
		{ kind: "ContentTooLarge" },
		{ kind: "NotInitialized" },
	],
} satisfies Record<string, NativeError[]>;

type SessionReport = {
	kind: string;
	message: string;
	attempts: number;
	unauthorized?: boolean;
};

function openSettings(page: Page): Promise<void> {
	return visit({
		page,
		path: "/settings",
		ready: page.getByRole("link", { name: "App Settings" }),
	});
}

async function reportSessionError({
	page,
	report: { unauthorized = false, ...report },
}: {
	page: Page;
	report: SessionReport;
}): Promise<void> {
	await emitEvent({
		page,
		event: "auth:session-error",
		payload: { ...report, unauthorized, transient: false },
	});
	await page.locator(ALERT).waitFor();
}

async function addToast({
	page,
	action,
}: {
	page: Page;
	action: () => Promise<void>;
}): Promise<void> {
	const shown = await page.locator(SHOWN_TOAST).count();
	await action();
	await page.locator(SHOWN_TOAST).nth(shown).waitFor();
}

async function tryAgainFailing({
	page,
	error,
	signingOut = [],
}: {
	page: Page;
	error: NativeError;
	signingOut?: MethodFault[];
}): Promise<void> {
	await changeScene({
		page,
		scene: {
			methodFaults: [
				{ command: "refresh_session", error },
				...signingOut,
			],
		},
	});
	await addToast({
		page,
		action: () =>
			page
				.locator(ALERT)
				.getByRole("button", { name: "Try again" })
				.click(),
	});
}

async function fillSignIn(page: Page): Promise<void> {
	await visit({
		page,
		path: "/auth/sign-in",
		ready: page.locator("form button[type=submit]"),
	});
	await page.locator("#email").fill("someone@example.com");
	await page.locator("#password").fill("fixture-password");
}

function submitSignIn(page: Page): Promise<void> {
	return addToast({
		page,
		action: () => page.locator("form button[type=submit]").click(),
	});
}

async function failSignIns({
	page,
	failures,
}: {
	page: Page;
	failures: NativeError[];
}): Promise<void> {
	for (const error of failures) {
		await changeScene({
			page,
			scene: { methodFaults: [{ command: "sign_in_with_email", error }] },
		});
		await submitSignIn(page);
	}
	await holdToast(page);
}

async function signInWithStorage(page: Page): Promise<void> {
	await fillSignIn(page);
	await changeScene({ page, scene: { signedOut: false } });
	await submitSignIn(page);
	await holdToast(page);
}

export const sessionAlerts: Scene = {
	platform: "phone",
	views: [
		{
			id: "feedback/session/refused",
			drive: async (page) => {
				await openSettings(page);
				await reportSessionError({
					page,
					report: {
						kind: "Auth",
						message: "Token refresh failed with status 403",
						attempts: 3,
					},
				});
			},
		},
		{
			id: "feedback/session/rate-limited",
			drive: async (page) => {
				await reportSessionError({
					page,
					report: {
						kind: "RateLimited",
						message: "Token refresh failed with status 429",
						attempts: 3,
					},
				});
				await page.getByText("Too many requests").first().waitFor();
				await holdToast(page);
			},
		},
		{
			id: "feedback/session/unreachable",
			drive: async (page) => {
				await reportSessionError({
					page,
					report: {
						kind: "Unauthorized",
						message: "Connection reset",
						attempts: 0,
					},
				});
				await page.getByText("Can’t connect to Grindr").waitFor();
			},
		},
	],
};

export const sessionTryAgain: Scene = {
	platform: "phone",
	views: [
		{
			id: "feedback/session/try-again",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openSettings(page);
				await reportSessionError({
					page,
					report: {
						kind: "Auth",
						message: "Token refresh failed with status 403",
						attempts: 1,
					},
				});
				for (const kind of ["Unexpected", "Connect", "RateLimited"]) {
					await tryAgainFailing({ page, error: { kind } });
				}
				await holdToast(page);
			},
		},
		{
			id: "feedback/session/expired",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				showsLoading(page);
				await tryAgainFailing({
					page,
					error: { kind: "NotSignedIn" },
					signingOut: [{ command: "sign_out", pending: true }],
				});
				await holdToast(page);
			},
		},
	],
};

export const accountStatus: Scene = {
	platform: "phone",
	views: [
		{
			id: "feedback/account/age-verification",
			drive: async (page) => {
				await openSettings(page);
				await emitEvent({
					page,
					event: "auth:restriction",
					payload: { kind: "ageVerification" },
				});
				await page.locator(ALERT).waitFor();
			},
		},
		{
			id: "feedback/account/restricted",
			drive: async (page) => {
				await emitEvent({
					page,
					event: "auth:restriction",
					payload: { kind: "other" },
				});
				await page.getByText("Account restricted").waitFor();
			},
		},
		{
			id: "feedback/account/banned",
			drive: async (page) => {
				await emitEvent({
					page,
					event: "auth:banned",
					payload: {
						kind: "ban",
						code: 0,
						message: "Account banned",
						reason: "spam",
					},
				});
				await page.getByText("(spam)").waitFor();
			},
		},
		{
			id: "feedback/account/banned-without-reason",
			drive: async (page) => {
				await emitEvent({
					page,
					event: "auth:banned",
					payload: {
						kind: "ban",
						code: 0,
						message: "Account banned",
					},
				});
				await page.getByText("(spam)").waitFor({ state: "detached" });
			},
		},
	],
};

export const signInFailures: Scene = {
	platform: "phone",
	demo: { signedOut: true },
	views: [
		{
			id: "auth/sign-in/server-errors",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await fillSignIn(page);
				await failSignIns({ page, failures: SIGN_IN_FAILURES.server });
			},
		},
		{
			id: "auth/sign-in/app-errors",
			survivesLocaleSwitch: false,
			drive: (page) =>
				failSignIns({ page, failures: SIGN_IN_FAILURES.app }),
		},
	],
};

export const storageUnavailable: Scene = {
	platform: "phone",
	demo: {
		signedOut: true,
		methodAnswers: { storage_backend: "unavailable" },
	},
	views: [{ id: "feedback/storage/unavailable", drive: signInWithStorage }],
};

export const storagePlainFile: Scene = {
	platform: "desktop",
	shim: "linux",
	demo: { signedOut: true, methodAnswers: { storage_backend: "file" } },
	views: [
		{
			id: "feedback/storage/plain-file",
			survivesLocaleSwitch: false,
			drive: signInWithStorage,
		},
	],
};
