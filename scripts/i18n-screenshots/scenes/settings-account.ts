import type { Page } from "@playwright/test";

import { demoMeProfileId } from "../../../src/lib/demo/config";
import type { ScreenshotScene } from "../../../src/lib/demo/screenshot-scene";
import { showsLoading } from "../settle";
import type { Scene } from ".";
import { failing } from "./faults";
import { addingToast } from "./toast";
import { visit } from "./visit";

const HIDDEN_IDS = [100003, 100004, 100006, 100007];
const BLOCKED_TOGGLE = /Blocked/;
const HIDDEN_TOGGLE = /Hidden/;

type ListPage = { id: string; path: string; toggle: RegExp };

const blockedList: ListPage = {
	id: "settings/account/blocked",
	path: "/settings/account/blocked",
	toggle: BLOCKED_TOGGLE,
};

const hiddenList: ListPage = {
	id: "settings/account/hidden",
	path: "/settings/account/hidden",
	toggle: HIDDEN_TOGGLE,
};

const hiddenRows: Partial<ScreenshotScene> = {
	restFaults: [
		{
			method: "GET",
			path: "/v1/hides",
			status: 200,
			body: { hides: HIDDEN_IDS.map((profileId) => ({ profileId })) },
		},
	],
};

function openList({
	page,
	list,
}: {
	page: Page;
	list: ListPage;
}): Promise<void> {
	return visit({
		page,
		path: list.path,
		ready: page.getByRole("switch", { name: list.toggle }),
	});
}

function listScene({
	list,
	demo,
}: {
	list: ListPage;
	demo?: Partial<ScreenshotScene>;
}): Scene {
	return {
		platform: "phone",
		demo,
		views: [{ id: list.id, drive: (page) => openList({ page, list }) }],
	};
}

function toggleFailure({
	list,
	demo,
}: {
	list: ListPage;
	demo: Partial<ScreenshotScene>;
}): Scene {
	return {
		platform: "phone",
		demo,
		views: [
			{
				id: `${list.id}/toggle-failed`,
				screen: list.id,
				survivesLocaleSwitch: false,
				drive: async (page) => {
					await openList({ page, list });
					await addingToast({
						page,
						action: () =>
							page
								.getByRole("switch", { name: list.toggle })
								.first()
								.click(),
					});
				},
			},
		],
	};
}

function emptyList({
	list,
	demo,
	title,
}: {
	list: ListPage;
	demo?: Partial<ScreenshotScene>;
	title: string;
}): Scene {
	return {
		platform: "phone",
		demo,
		views: [
			{
				id: `${list.id}/empty`,
				drive: (page) =>
					visit({
						page,
						path: list.path,
						ready: page.getByText(title),
					}),
			},
		],
	};
}

export const blockedProfiles = listScene({ list: blockedList });

export const hiddenProfiles = listScene({ list: hiddenList, demo: hiddenRows });

export const unblockFailure = toggleFailure({
	list: blockedList,
	demo: {
		restFaults: [
			failing({ method: "DELETE", path: { pattern: "^/v3/me/blocks/" } }),
		],
	},
});

export const unhideFailure = toggleFailure({
	list: hiddenList,
	demo: {
		restFaults: [
			...(hiddenRows.restFaults ?? []),
			failing({ method: "DELETE", path: { pattern: "^/v1/hides/" } }),
		],
	},
});

export const noBlockedProfiles = emptyList({
	list: blockedList,
	demo: { emptyLists: ["blocks"] },
	title: "No Blocked Users",
});

export const noHiddenProfiles = emptyList({
	list: hiddenList,
	title: "No Hidden Users",
});

export const profileListLoadFailed: Scene = {
	platform: "phone",
	demo: { restFaults: [failing({ method: "POST", path: "/v3/profiles" })] },
	views: [
		{
			id: "settings/account/blocked/load-failed",
			screen: "settings/account/blocked",
			survivesLocaleSwitch: false,
			drive: (page) => {
				showsLoading(page);
				return addingToast({
					page,
					action: () =>
						visit({
							page,
							path: blockedList.path,
							ready: page.getByRole("main"),
						}),
				});
			},
		},
	],
};

export const accountUnimplemented: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/account/unimplemented",
			screen: "settings/account",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await visit({
					page,
					path: "/settings/account",
					ready: page.getByRole("link", { name: "Email" }),
				});
				await addingToast({
					page,
					action: () =>
						page.getByRole("link", { name: "Email" }).click(),
				});
			},
		},
	],
};

function distanceSwitch(page: Page) {
	return page.getByRole("switch", { name: "Show my distance" });
}

function openPrivacy(page: Page): Promise<void> {
	return visit({
		page,
		path: "/settings/account/privacy",
		ready: distanceSwitch(page),
	});
}

export const privacySettings: Scene = {
	platform: "phone",
	views: [{ id: "settings/account/privacy", drive: openPrivacy }],
};

export const privacySaveFailed: Scene = {
	platform: "phone",
	demo: {
		restFaults: [failing({ method: "PATCH", path: "/v4/me/profile" })],
	},
	views: [
		{
			id: "settings/account/privacy/save-failed",
			screen: "settings/account/privacy",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openPrivacy(page);
				await page
					.getByRole("switch", {
						name: "Show my distance",
						disabled: false,
					})
					.waitFor();
				await addingToast({
					page,
					action: () => distanceSwitch(page).click(),
				});
			},
		},
	],
};

export const telegramWarning: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/me/telegram",
			screen: "settings/me",
			drive: async (page) => {
				const announcements = page.getByRole("button", {
					name: "Open Grind announcements",
				});
				await visit({ page, path: "/settings", ready: announcements });
				await announcements.click();
				await page.getByRole("dialog").waitFor();
			},
		},
	],
};

export const meNameFailed: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			failing({ method: "GET", path: `/v7/profiles/${demoMeProfileId}` }),
		],
	},
	views: [
		{
			id: "settings/me/name-failed",
			drive: (page) =>
				visit({
					page,
					path: "/settings",
					ready: page.getByText("load name"),
				}),
		},
	],
};
