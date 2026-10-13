import type { Page } from "@playwright/test";

import { setPageVisibility } from "../../../e2e/support/geolocation";
import { TAPS_PANE, VIEWS_PANE } from "../../../e2e/support/interest-pager";
import { demoMeProfileId } from "../../../src/lib/demo/config";
import type { RestFault } from "../../../src/lib/demo/screenshot-scene";
import type { Scene } from ".";
import { changeScene } from "./drive";
import { CONNECT_FAILED } from "./faults";
import { addingToast, toastsShown } from "./toast";
import { visit } from "./visit";

const EMPTY_TITLE = '[data-slot="empty-title"]';
const PROFILE_LINK = 'a[href^="/profile/"]';
const MAX_DISPLAY_COUNT = 99;
const VIEWED_AT = [
	"2026-07-21T12:40:00Z",
	"2026-07-21T11:05:00Z",
	"2026-07-21T09:30:00Z",
	"2026-07-21T07:15:00Z",
	"2026-07-21T05:00:00Z",
	"2026-07-21T03:20:00Z",
];
const VIEWER_PHOTO = "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567";
const PREFERENCES = "/v3/me/prefs/settings";

function preview({
	secretAdmirer,
	views,
	viewedAt,
}: {
	secretAdmirer: boolean;
	views: number;
	viewedAt: string;
}) {
	return {
		profileImageMediaHash: secretAdmirer ? null : VIEWER_PHOTO,
		distance: null,
		isFavorite: false,
		lastViewed: Date.parse(viewedAt),
		isSecretAdmirer: secretAdmirer,
		viewedCount: { totalCount: views, maxDisplayCount: MAX_DISPLAY_COUNT },
	};
}

const VIEWS = {
	profiles: [],
	previews: [
		{ secretAdmirer: true, views: 3 },
		{ secretAdmirer: false, views: 150 },
		{ secretAdmirer: false, views: 2 },
		{ secretAdmirer: true, views: 1 },
		{ secretAdmirer: false, views: 1 },
		{ secretAdmirer: true, views: 12 },
	].map((viewer, index) =>
		preview({ ...viewer, viewedAt: VIEWED_AT[index] ?? "" }),
	),
};

const HIDDEN_VIEWED_ME: RestFault = {
	method: "GET",
	path: PREFERENCES,
	status: 200,
	body: {
		profileId: demoMeProfileId,
		locationSearchOptOut: false,
		incognito: false,
		hideViewedMe: true,
		approximateDistance: false,
		viewRightNowNsfw: false,
		showOnMap: true,
		mapLocationFuzzRadius: null,
	},
};

function openViews({ page, ready }: { page: Page; ready: string }) {
	return visit({
		page,
		path: "/interest/views",
		ready: page.locator(VIEWS_PANE).locator(ready),
	});
}

export const emptyTaps: Scene = {
	platform: "phone",
	demo: { emptyLists: ["taps"] },
	views: [
		{
			id: "interest/taps/empty",
			drive: (page) =>
				visit({
					page,
					path: "/interest/taps",
					ready: page.locator(EMPTY_TITLE),
				}),
		},
	],
};

export const viewsGrid: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			{ method: "GET", path: "/v7/views/list", status: 200, body: VIEWS },
		],
	},
	views: [
		{
			id: "interest/views",
			drive: (page) => openViews({ page, ready: '[title*="150 views"]' }),
		},
	],
};

export const emptyViews: Scene = {
	platform: "phone",
	demo: { emptyLists: ["views"] },
	views: [
		{
			id: "interest/views/empty",
			drive: (page) => openViews({ page, ready: EMPTY_TITLE }),
		},
	],
};

export const untrackedViews: Scene = {
	platform: "phone",
	demo: { emptyLists: ["views"], restFaults: [HIDDEN_VIEWED_ME] },
	views: [
		{
			id: "interest/views/untracked",
			drive: (page) => openViews({ page, ready: EMPTY_TITLE }),
		},
		{
			id: "interest/views/untracked/failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await changeScene({
					page,
					scene: {
						restFaults: [
							HIDDEN_VIEWED_ME,
							{
								method: "PUT",
								path: PREFERENCES,
								error: CONNECT_FAILED,
							},
						],
					},
				});
				await addingToast({
					page,
					action: () =>
						page.getByRole("button", { name: "Turn on" }).click(),
				});
			},
		},
	],
};

export const interestRefreshFailures: Scene = {
	platform: "phone",
	views: [
		{
			id: "interest/refresh-failures",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await visit({
					page,
					path: "/interest/taps",
					ready: page.locator(TAPS_PANE).locator(PROFILE_LINK),
				});
				await page.getByRole("link", { name: "Views" }).click();
				await page
					.locator(VIEWS_PANE)
					.locator(PROFILE_LINK)
					.first()
					.waitFor();
				await changeScene({
					page,
					scene: {
						restFaults: [
							{
								path: "/v2/taps/received",
								error: CONNECT_FAILED,
							},
							{ path: "/v7/views/list", error: CONNECT_FAILED },
						],
					},
				});
				await setPageVisibility(page, "hidden");
				await setPageVisibility(page, "visible");
				await toastsShown({ page, count: 2 });
			},
		},
	],
};
