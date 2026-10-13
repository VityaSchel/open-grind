import type { Page } from "@playwright/test";

import { MESSAGE_ROW } from "../../../e2e/support/app";
import { profileTile } from "../../../e2e/support/gps";
import type { RestFault } from "../../../src/lib/demo/screenshot-scene";
import type { Scene } from ".";
import { chooseNeutralLocation, LOCATION_TITLE } from "./browse";
import { TEXT_CONVERSATION } from "./chat";
import { chooseFromMessageMenu, lastOutgoing } from "./chat-drive";
import { ALERT, changeScene } from "./drive";
import { failClipboard } from "./faults";
import { holdToast } from "./toast";
import { visit } from "./visit";

const CASCADE = { pattern: "^/v4/cascade" };
const UNSEND_REFUSED: RestFault = {
	method: "POST",
	path: "/v4/chat/message/unsend",
	status: 403,
	body: { type: "urn:gr:err:tiered_feature", featureValue: "UnsentMessage" },
};

function copyErrorButton(page: Page) {
	return page.getByRole("button", { name: "Copy error details" });
}

async function askToUnsendLastMessage(page: Page): Promise<void> {
	await page.locator(MESSAGE_ROW).first().waitFor();
	await chooseFromMessageMenu({
		row: lastOutgoing(page),
		action: "Unsend message",
	});
	await page.locator(ALERT).waitFor();
}

async function showFailureToast(page: Page): Promise<void> {
	await page.evaluate(() =>
		window.__openGrindScreenshots?.showErrorToast({
			error: { kind: "Http", message: "Request failed with status 500" },
		}),
	);
	await holdToast(page);
}

async function confirmCopyError(page: Page): Promise<void> {
	await page
		.locator("[data-sonner-toast]")
		.getByRole("button", { name: "Copy error details" })
		.last()
		.click();
	await page.locator(ALERT).waitFor();
}

async function copyConfirmed(page: Page): Promise<void> {
	await page.locator(ALERT).getByRole("button", { name: "Copy" }).click();
	await page.locator(ALERT).waitFor({ state: "hidden" });
	await holdToast(page);
}

function blockedGrid({
	kind,
	platform,
	id,
	answer,
}: {
	kind: string;
	platform: Scene["platform"];
	id: string;
	answer: "Rotate device parameters" | "Close";
}): Scene {
	return {
		platform,
		demo: { restFaults: [{ path: CASCADE, error: { kind } }] },
		views: [
			{
				id,
				drive: async (page) => {
					await chooseNeutralLocation(page);
					await page.locator(ALERT).waitFor();
				},
			},
			{
				id: `${id}/grid`,
				survivesLocaleSwitch: answer === "Close",
				drive: async (page) => {
					await page
						.locator(ALERT)
						.getByRole("button", { name: answer })
						.click();
					await page.locator(ALERT).waitFor({ state: "hidden" });
					await copyErrorButton(page).waitFor();
					if (answer !== "Close") await holdToast(page);
				},
			},
		],
	};
}

export const requestBlocked = blockedGrid({
	kind: "RequestBlocked",
	platform: "phone",
	id: "feedback/request-blocked",
	answer: "Rotate device parameters",
});

export const networkBlocked = blockedGrid({
	kind: "NetworkBlocked",
	platform: "desktop",
	id: "feedback/network-blocked",
	answer: "Close",
});

export const copyError: Scene = {
	platform: "phone",
	views: [
		{
			id: "feedback/error-toast",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await visit({
					page,
					path: "/settings",
					ready: page.getByRole("link", { name: "App Settings" }),
				});
				await showFailureToast(page);
			},
		},
		{ id: "feedback/copy-error", drive: confirmCopyError },
		{
			id: "feedback/copy-error/copied",
			survivesLocaleSwitch: false,
			drive: copyConfirmed,
		},
		{
			id: "feedback/copy-error/failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await failClipboard(page);
				await showFailureToast(page);
				await confirmCopyError(page);
				await copyConfirmed(page);
				await page.getByText("Couldn’t copy to clipboard").waitFor();
			},
		},
	],
};

async function retryWith({
	page,
	fault,
	shows,
}: {
	page: Page;
	fault: RestFault;
	shows: string;
}): Promise<void> {
	await changeScene({ page, scene: { restFaults: [fault] } });
	await page.getByRole("button", { name: "Try again" }).click();
	await page.getByText(shows).waitFor();
}

export const inboxFailure: Scene = {
	platform: "desktop",
	demo: {
		restFaults: [
			{ method: "POST", path: "/v4/inbox", error: { kind: "Connect" } },
		],
	},
	views: [
		{
			id: "feedback/api-error/connect",
			drive: (page) =>
				visit({ page, path: "/chat", ready: copyErrorButton(page) }),
		},
		{
			id: "feedback/api-error/server-error",
			drive: (page) =>
				retryWith({
					page,
					fault: { method: "POST", path: "/v4/inbox", status: 500 },
					shows: "Grindr ran into a problem",
				}),
		},
		{
			id: "feedback/api-error/bad-request",
			drive: (page) =>
				retryWith({
					page,
					fault: { method: "POST", path: "/v4/inbox", status: 400 },
					shows: "Something went wrong",
				}),
		},
	],
};

export const gridFailure: Scene = {
	platform: "phone",
	demo: { restFaults: [{ path: CASCADE, error: { kind: "Http" } }] },
	views: [
		{
			id: "feedback/api-error/http",
			drive: async (page) => {
				await chooseNeutralLocation(page);
				await copyErrorButton(page).waitFor();
			},
		},
	],
};

export const profileFailure: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			{
				method: "GET",
				path: { pattern: "^/v7/profiles/100001$" },
				error: { kind: "SessionStale" },
			},
		],
	},
	views: [
		{
			id: "feedback/api-error/session-stale",
			drive: (page) =>
				visit({
					page,
					path: "/profile/100001",
					ready: copyErrorButton(page),
				}),
		},
	],
};

export const bypassWithoutLocation: Scene = {
	platform: "phone",
	demo: { restFaults: [UNSEND_REFUSED] },
	views: [
		{
			id: "feedback/bypass",
			drive: async (page) => {
				await visit({
					page,
					path: TEXT_CONVERSATION,
					ready: page.locator(MESSAGE_ROW),
				});
				await askToUnsendLastMessage(page);
			},
		},
		{
			id: "feedback/bypass/needs-location",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await page.getByRole("button", { name: "Bypass" }).click();
				await holdToast(page);
			},
		},
	],
};

export const bypassFailure: Scene = {
	platform: "phone",
	demo: { restFaults: [UNSEND_REFUSED] },
	views: [
		{
			id: "feedback/bypass/failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await chooseNeutralLocation(page);
				await profileTile(page).first().waitFor();
				await page.locator('nav a[href="/chat"]').first().click();
				await page
					.locator(`main a[href="${TEXT_CONVERSATION}"]`)
					.first()
					.click();
				await askToUnsendLastMessage(page);
				await changeScene({
					page,
					scene: {
						restFaults: [
							UNSEND_REFUSED,
							{
								method: "PUT",
								path: "/v4/location",
								error: { kind: "Connect" },
							},
						],
					},
				});
				await page.getByRole("button", { name: "Bypass" }).click();
				await page
					.getByText("Couldn’t bypass this paid feature")
					.waitFor();
				await holdToast(page);
			},
		},
	],
};

export const autoLocation: Scene = {
	platform: "phone",
	views: [
		{
			id: "feedback/auto-location",
			drive: async (page) => {
				await visit({
					page,
					path: "/",
					ready: page.locator(LOCATION_TITLE),
				});
				await page
					.getByRole("button", { name: "Use current location" })
					.click();
				await holdToast(page);
			},
		},
	],
};
