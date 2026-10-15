import type { Locator, Page } from "@playwright/test";

import type { NativeError } from "../../../src/lib/demo/screenshot-scene";
import { showsLoading } from "../settle";
import { overrideNative } from "../stubs";
import type { Scene } from ".";
import { ALERT, changeScene, emitEvent } from "./drive";
import { addingToast, holdToast } from "./toast";
import { visit } from "./visit";

const GOOGLE_SIGN_IN = "/auth/sign-in/google";
const TOKEN_FIELD = "textarea#token";
const COMPANION_VERSION = "1.2.0";
const COMPANION_DOWNLOAD_BYTES = 4_800_000;
const EMIT_ATTEMPTS = 40;
const EMIT_WAIT_MS = 250;
const COMPANION_RELEASE = {
	component: "google-oauth",
	kind: "install",
	tag: `v${COMPANION_VERSION}`,
	version: COMPANION_VERSION,
	total: COMPANION_DOWNLOAD_BYTES,
};

function card(page: Page): Locator {
	return page.locator("main");
}

function cardButton({ page, name }: { page: Page; name: string }): Locator {
	return card(page).getByRole("button", { name });
}

function companionFailure(message: string): NativeError {
	return { kind: "Auth", message };
}

function openGoogleSignIn({
	page,
	query = "",
	ready,
}: {
	page: Page;
	query?: string;
	ready: Locator;
}): Promise<void> {
	return visit({ page, path: `${GOOGLE_SIGN_IN}${query}`, ready });
}

export const googleInstall: Scene = {
	platform: "phone",
	demo: { signedOut: true },
	views: [
		{
			id: "auth/google/install",
			drive: (page) =>
				openGoogleSignIn({
					page,
					ready: cardButton({ page, name: "Install" }),
				}),
		},
	],
};

export const googlePlayInstall: Scene = {
	platform: "phone",
	demo: { signedOut: true, playBuild: true },
	views: [
		{
			id: "auth/google/install-play",
			drive: (page) =>
				openGoogleSignIn({
					page,
					ready: card(page).getByText("Signing in with Google needs"),
				}),
		},
	],
};

export const googleContinue: Scene = {
	platform: "phone",
	demo: { signedOut: true, updates: true },
	native: { updater_installed_version: { answer: COMPANION_VERSION } },
	views: [
		{
			id: "auth/google/continue",
			drive: (page) =>
				openGoogleSignIn({
					page,
					ready: cardButton({ page, name: "Continue" }),
				}),
		},
		{
			id: "auth/google/continue/unavailable",
			screen: "auth/google/install",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await changeScene({
					page,
					scene: {
						methodFaults: [
							{
								command: "sign_in_with_google",
								error: companionFailure(
									"companion-unavailable",
								),
							},
						],
					},
				});
				await addingToast({
					page,
					action: () =>
						cardButton({ page, name: "Continue" }).click(),
				});
				await cardButton({ page, name: "Install" }).waitFor();
			},
		},
	],
};

export const googlePaste: Scene = {
	platform: "phone",
	demo: { signedOut: true },
	views: [
		{
			id: "auth/google/paste",
			drive: (page) =>
				openGoogleSignIn({
					page,
					query: "?paste",
					ready: page.locator(TOKEN_FIELD),
				}),
		},
		{
			id: "auth/google/paste/companion-refusals",
			screen: "auth/google/paste",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				for (const message of [
					"companion-untrusted",
					"companion-refused",
				]) {
					await card(page)
						.getByRole("link", { name: "Go back" })
						.dispatchEvent("click");
					await changeScene({
						page,
						scene: {
							methodFaults: [
								{
									command: "sign_in_with_google",
									error: companionFailure(message),
								},
							],
						},
					});
					await addingToast({
						page,
						action: () =>
							page
								.getByRole("button", {
									name: "Sign in with Google",
								})
								.dispatchEvent("click"),
					});
					await page.locator(TOKEN_FIELD).waitFor();
				}
			},
		},
	],
};

async function finishOnboarding({
	page,
	lands,
}: {
	page: Page;
	lands: Locator;
}): Promise<void> {
	await visit({
		page,
		path: "/onboarding",
		ready: page.getByRole("button", { name: "Get started" }),
	});
	await changeScene({ page, scene: { onboarding: false } });
	await page.getByRole("button", { name: "Get started" }).click();
	await lands.first().waitFor();
}

export const googleSigningIn: Scene = {
	platform: "phone",
	demo: { signedOut: true, onboarding: true },
	native: {
		google_handoff_pending: { answer: true },
		backend_ready: { answer: true },
		sign_in_with_google_handoff: { pending: true },
	},
	views: [
		{
			id: "auth/google/signing-in",
			drive: async (page) => {
				showsLoading(page);
				await finishOnboarding({
					page,
					lands: page.getByText("Signing you in"),
				});
			},
		},
	],
};

export const googleHandoff: Scene = {
	platform: "phone",
	demo: { onboarding: true },
	native: {
		google_handoff_pending: {
			sequence: [{ answer: true }, { answer: false }],
		},
		backend_ready: { answer: true },
	},
	views: [
		{
			id: "auth/google-handoff/switch-account",
			screen: "browse/location",
			drive: (page) =>
				finishOnboarding({ page, lands: page.locator(ALERT) }),
		},
		{
			id: "auth/google-handoff/expired",
			screen: "browse/location",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await page
					.locator(ALERT)
					.getByRole("button", { name: "Continue" })
					.click();
				await page.getByText("That Google sign-in expired").waitFor();
				await holdToast(page);
			},
		},
	],
};

async function showCompanionProgress({
	page,
	phase,
	received,
	shows,
}: {
	page: Page;
	phase: "downloading" | "verifying" | "ready";
	received: number;
	shows: Locator;
}): Promise<void> {
	for (let attempt = 1; attempt <= EMIT_ATTEMPTS; attempt += 1) {
		await emitEvent({
			page,
			event: "updater:progress",
			payload: { ...COMPANION_RELEASE, phase, received },
		});
		const shown = await shows
			.waitFor({ timeout: EMIT_WAIT_MS })
			.then(() => true)
			.catch(() => false);
		if (shown) return;
	}
	throw new Error(`The companion install never showed ${phase}`);
}

export const googleInstallStages: Scene = {
	platform: "phone",
	demo: { signedOut: true, updates: true, onboarding: true },
	views: [
		{
			id: "auth/google/install/downloading",
			screen: "auth/google/install",
			drive: async (page) => {
				showsLoading(page);
				await finishOnboarding({
					page,
					lands: page.locator("form button[type=submit]"),
				});
				await changeScene({
					page,
					scene: {
						methodFaults: [
							{
								command: "sign_in_with_google",
								error: companionFailure(
									"companion-unavailable",
								),
							},
						],
					},
				});
				await page
					.getByRole("button", { name: "Sign in with Google" })
					.click();
				await cardButton({ page, name: "Install" }).waitFor();
				await showCompanionProgress({
					page,
					phase: "downloading",
					received: COMPANION_DOWNLOAD_BYTES / 4,
					shows: cardButton({ page, name: "Downloading" }),
				});
			},
		},
		{
			id: "auth/google/install/verifying",
			screen: "auth/google/install",
			drive: (page) =>
				showCompanionProgress({
					page,
					phase: "verifying",
					received: COMPANION_DOWNLOAD_BYTES,
					shows: cardButton({ page, name: "Verifying" }),
				}),
		},
		{
			id: "auth/google/install/installing",
			screen: "auth/google/install",
			drive: async (page) => {
				await overrideNative({
					page,
					overrides: {
						updater_readiness: {
							answer: {
								state: "ready",
								detail: {
									tag: COMPANION_RELEASE.tag,
									version: COMPANION_VERSION,
									kind: "install",
									canInstallNow: true,
								},
							},
						},
						updater_install: { pending: true },
					},
				});
				await showCompanionProgress({
					page,
					phase: "ready",
					received: COMPANION_DOWNLOAD_BYTES,
					shows: cardButton({ page, name: "Install" }),
				});
				await cardButton({ page, name: "Install" }).click();
				await cardButton({ page, name: "Installing" }).waitFor();
			},
		},
	],
};
