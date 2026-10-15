import type { Page } from "@playwright/test";

import { demoMeProfileId } from "../../../src/lib/demo/config";
import type {
	MethodFault,
	NativeError,
} from "../../../src/lib/demo/screenshot-scene";
import { showsLoading } from "../settle";
import type { Scene } from ".";
import { ALERT, changeScene, emitEvent } from "./drive";
import { holdToast, waitForNewToast } from "./toast";
import { visit } from "./visit";

const STALE_SESSION = {
	profileId: demoMeProfileId,
	expiresAt: null,
	stale: true,
};
const IPC_FAILURE = "IPC connection closed";
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
	app: [{ kind: "NotInitialized" }],
} satisfies Record<string, NativeError[]>;

type SessionReport = {
	kind: string;
	message: string;
	attempts: number;
	transient?: boolean;
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
	report: { transient = false, ...report },
}: {
	page: Page;
	report: SessionReport;
}): Promise<void> {
	if (transient) {
		await changeScene({
			page,
			scene: { methodAnswers: { current_session: STALE_SESSION } },
		});
	}
	await emitEvent({
		page,
		event: "auth:session-error",
		payload: { ...report, transient, unauthorized: false },
	});
	await page.locator(ALERT).waitFor();
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
	await waitForNewToast({
		page,
		action: () =>
			page
				.locator(ALERT)
				.getByRole("button", { name: "Try again" })
				.click(),
	});
}

export async function fillSignIn(page: Page): Promise<void> {
	await visit({
		page,
		path: "/auth/sign-in",
		ready: page.locator("form button[type=submit]"),
	});
	await page.locator("#email").fill("someone@example.com");
	await page.locator("#password").fill("fixture-password");
}

function submitSignIn(page: Page): Promise<void> {
	return waitForNewToast({
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
			screen: "settings/me",
			drive: async (page) => {
				await openSettings(page);
				await reportSessionError({
					page,
					report: {
						kind: "Auth",
						message: "Token refresh failed with status 403",
						attempts: 3,
						transient: true,
					},
				});
			},
		},
		{
			id: "feedback/session/rate-limited",
			screen: "settings/me",
			drive: async (page) => {
				await reportSessionError({
					page,
					report: {
						kind: "RateLimited",
						message: "Token refresh failed with status 429",
						attempts: 3,
						transient: true,
					},
				});
				await page.getByText("Too many requests").first().waitFor();
				await holdToast(page);
			},
		},
		{
			id: "feedback/session/unreachable",
			screen: "settings/me",
			drive: async (page) => {
				await reportSessionError({
					page,
					report: {
						kind: "Http",
						message: "error sending request: connection reset",
						attempts: 3,
						transient: true,
					},
				});
				await page.getByText("Can’t connect to Grindr").waitFor();
				await holdToast(page);
			},
		},
	],
};

export const sessionTryAgain: Scene = {
	platform: "phone",
	views: [
		{
			id: "feedback/session/try-again",
			screen: "settings/me",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openSettings(page);
				await reportSessionError({
					page,
					report: {
						kind: "Auth",
						message: "Token refresh failed with status 403",
						attempts: 0,
					},
				});
				for (const error of [
					IPC_FAILURE,
					{ kind: "Connect" },
					{ kind: "RateLimited" },
				]) {
					await tryAgainFailing({ page, error });
				}
				await holdToast(page);
			},
		},
		{
			id: "feedback/session/expired",
			screen: "settings/me",
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
			screen: "settings/me",
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
			screen: "settings/me",
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
			screen: "settings/me",
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
			screen: "settings/me",
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
			screen: "auth/sign-in",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await fillSignIn(page);
				await failSignIns({ page, failures: SIGN_IN_FAILURES.server });
			},
		},
		{
			id: "auth/sign-in/app-errors",
			screen: "auth/sign-in",
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
	views: [
		{
			id: "feedback/storage/unavailable",
			screen: "browse/location",
			drive: signInWithStorage,
		},
	],
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
