import type { Page } from "@playwright/test";

import { demoMeProfileId } from "../../../src/lib/demo/config";
import type {
	MethodFault,
	NativeError,
} from "../../../src/lib/demo/screenshot-scene";
import {
	type BanSubReason,
	banSubReasonSchema,
} from "../../../src/lib/model/authentication";
import { showsLoading } from "../settle";
import type { Scene, SceneView } from ".";
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

const BANNED = { kind: "profile", code: 27, message: "Account banned" };
const SUSPENSION_ENDS_AT = Date.parse("2026-07-24T18:30:00Z");
const SHOWN_BAN_REASONS = new Set<BanSubReason>([
	"PROFILE_SPAM",
	"DRUG_SALES",
	"MILD_INSULTS",
]);
const UNLABELED_BAN_REASONS = new Set<BanSubReason>([
	"BLOCK_DECISION",
	"Other",
]);
const ALERT_DESCRIPTION = `${ALERT} [data-slot="alert-dialog-description"]`;

async function showAccountStatus({
	page,
	event,
	payload,
}: {
	page: Page;
	event: string;
	payload: unknown;
}): Promise<void> {
	const description = page.locator(ALERT_DESCRIPTION);
	const before =
		(await description.count()) > 0
			? await description.textContent()
			: null;
	await emitEvent({ page, event, payload });
	await page.waitForFunction(
		({ selector, previous }) => {
			const text = document.querySelector(selector)?.textContent ?? null;
			return text !== null && text !== previous;
		},
		{ selector: ALERT_DESCRIPTION, previous: before },
	);
}

function accountStatusView({
	id,
	event,
	payload,
}: {
	id: string;
	event: "auth:banned" | "auth:restriction";
	payload: Record<string, unknown>;
}): SceneView {
	return {
		id: `feedback/account/${id}`,
		screen: "settings/me",
		drive: (page) => showAccountStatus({ page, event, payload }),
	};
}

function banReasonView(subReason: BanSubReason): SceneView {
	return accountStatusView({
		id: `ban-reason/${subReason.toLowerCase().replaceAll("_", "-")}`,
		event: "auth:banned",
		payload: { ...BANNED, subReason },
	});
}

async function failSignInWith({
	page,
	error,
}: {
	page: Page;
	error: NativeError;
}): Promise<void> {
	await changeScene({
		page,
		scene: { methodFaults: [{ command: "sign_in_with_email", error }] },
	});
	await page.locator("form button[type=submit]").click();
	await page.locator(ALERT).waitFor();
}

export const accountStatus: Scene = {
	platform: "phone",
	views: [
		{
			id: "feedback/account/age-verification",
			screen: "settings/me",
			drive: async (page) => {
				await openSettings(page);
				await showAccountStatus({
					page,
					event: "auth:restriction",
					payload: { kind: "ageVerification" },
				});
			},
		},
		accountStatusView({
			id: "restricted",
			event: "auth:restriction",
			payload: { kind: "other" },
		}),
		accountStatusView({
			id: "banned",
			event: "auth:banned",
			payload: {
				...BANNED,
				reason: "Scam / Spam",
				subReason: "PROFILE_SPAM",
			},
		}),
		accountStatusView({
			id: "banned-without-reason",
			event: "auth:banned",
			payload: BANNED,
		}),
		accountStatusView({
			id: "network-blocked",
			event: "auth:banned",
			payload: { kind: "network", code: 31, message: "IP is banned" },
		}),
		accountStatusView({
			id: "security-check-failed",
			event: "auth:banned",
			payload: { kind: "device", code: 28, message: "Device is banned" },
		}),
		accountStatusView({
			id: "age-restricted",
			event: "auth:banned",
			payload: { kind: "underage", code: 35, message: "Age restricted" },
		}),
		accountStatusView({
			id: "suspended",
			event: "auth:restriction",
			payload: {
				kind: "timedBan",
				reason: "Drug Selling",
				subReason: "DRUG_SALES",
				endsAt: SUSPENSION_ENDS_AT,
			},
		}),
		accountStatusView({
			id: "suspended-without-reason",
			event: "auth:restriction",
			payload: { kind: "timedBan", endsAt: SUSPENSION_ENDS_AT },
		}),
		accountStatusView({
			id: "suspended-indefinitely",
			event: "auth:restriction",
			payload: {
				kind: "timedBan",
				reason: "Insults",
				subReason: "MILD_INSULTS",
			},
		}),
		accountStatusView({
			id: "suspended-indefinitely-without-reason",
			event: "auth:restriction",
			payload: { kind: "timedBan" },
		}),
		...banSubReasonSchema.options
			.filter(
				(subReason) =>
					!SHOWN_BAN_REASONS.has(subReason) &&
					!UNLABELED_BAN_REASONS.has(subReason),
			)
			.map(banReasonView),
	],
};

export const signInAccountStatus: Scene = {
	platform: "phone",
	demo: { signedOut: true },
	views: [
		{
			id: "feedback/account/phone-verification",
			screen: "auth/sign-in",
			drive: async (page) => {
				await fillSignIn(page);
				await failSignInWith({
					page,
					error: {
						kind: "Api",
						message: { code: 30, message: "Verification required" },
					},
				});
			},
		},
		{
			id: "feedback/account/update-required",
			screen: "auth/sign-in",
			drive: async (page) => {
				await page
					.locator(ALERT)
					.getByRole("button", { name: "OK" })
					.click();
				await page.locator(ALERT).waitFor({ state: "detached" });
				await failSignInWith({
					page,
					error: {
						kind: "Api",
						message: {
							code: 8,
							message: "The client version is deprecated",
						},
					},
				});
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
