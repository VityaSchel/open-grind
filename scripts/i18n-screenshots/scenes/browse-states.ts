import type { Page } from "@playwright/test";

import { runPaletteCommand } from "../../../e2e/support/app";
import { profileTile } from "../../../e2e/support/gps";
import type { RestFault } from "../../../src/lib/demo/screenshot-scene";
import { showsLoading } from "../settle";
import { overrideNative } from "../stubs";
import type { Scene } from ".";
import { chooseNeutralLocation, GRID_SCROLLER } from "./browse";
import { revealRefreshButton, scrollToBottom } from "./chat-drive";
import { changeScene } from "./drive";
import { CONNECT_FAILED, STORAGE_FULL, UNREADABLE_PREFERENCES } from "./faults";
import { fillSignIn } from "./session";
import { addingToast, toastsShown } from "./toast";
import { visit } from "./visit";

export const GRID_READY = '[aria-label*="All filters"]';
const CASCADE = { pattern: "^/v4/cascade" };
const SECOND_GRID_PAGE = { pattern: "^/v4/cascade\\?(.*&)?pageNumber=1(&|$)" };
const LAZY_PROFILE_ID = 100001;
const LAZY_CASCADE = {
	items: [{ type: "full_profile_v1", data: { profileId: LAZY_PROFILE_ID } }],
	nextPage: null,
	shuffled: false,
	hiddenProfiles: null,
	hiddenProfileInfo: null,
};

export async function showGrid(page: Page): Promise<void> {
	await chooseNeutralLocation(page);
	await page.waitForURL(
		({ pathname, search }) => pathname === "/" && !search,
	);
	await page.locator(GRID_READY).waitFor();
	await profileTile(page).first().waitFor();
}

function emptyTitle({ page, title }: { page: Page; title: string }) {
	return page.locator('[data-slot="empty-title"]', { hasText: title });
}

async function filterGrid({
	page,
	query,
	shows,
}: {
	page: Page;
	query: string;
	shows: string;
}): Promise<void> {
	await runPaletteCommand(page, query);
	await emptyTitle({ page, title: shows }).waitFor();
}

export const gridEmpty: Scene = {
	platform: "phone",
	demo: { emptyLists: ["grid"] },
	views: [
		{
			id: "browse/grid/empty",
			drive: async (page) => {
				await chooseNeutralLocation(page);
				await emptyTitle({
					page,
					title: "No Profiles Found",
				}).waitFor();
			},
		},
		{
			id: "browse/grid/empty/favorites",
			drive: (page) =>
				filterGrid({
					page,
					query: "?favorites=true",
					shows: "No Favorites Yet",
				}),
		},
		{
			id: "browse/grid/empty/favorites-filtered",
			drive: (page) =>
				filterGrid({
					page,
					query: "?favorites=true&online=true",
					shows: "No Results",
				}),
		},
	],
};

export const gridLoadingMore: Scene = {
	platform: "phone",
	demo: {
		restFaults: [{ method: "GET", path: SECOND_GRID_PAGE, pending: true }],
	},
	views: [
		{
			id: "browse/grid/loading-more",
			drive: async (page) => {
				showsLoading(page);
				await showGrid(page);
				await scrollToBottom({ page, scroller: GRID_SCROLLER });
				await page
					.getByRole("status")
					.getByText("Loading more profiles")
					.waitFor({ state: "attached" });
			},
		},
	],
};

export const gridLoadMoreFailure: Scene = {
	platform: "phone",
	demo: {
		restFaults: [{ method: "GET", path: SECOND_GRID_PAGE, status: 400 }],
	},
	views: [
		{
			id: "browse/grid/load-more-failed",
			drive: async (page) => {
				await showGrid(page);
				await scrollToBottom({ page, scroller: GRID_SCROLLER });
				await page.getByRole("button", { name: "Try again" }).waitFor();
			},
		},
	],
};

export const gridRefreshFailures: Scene = {
	platform: "desktop",
	views: [
		{
			id: "browse/grid/refresh-failures",
			screen: "feedback/network-blocked/grid",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await showGrid(page);
				await overrideNative({
					page,
					overrides: { write_app_data: { reject: STORAGE_FULL } },
				});
				await addingToast({
					page,
					action: () =>
						page
							.locator("main")
							.getByRole("button", { name: "Online" })
							.click(),
				});
				await profileTile(page).first().waitFor();
				const cascadeFails: RestFault = {
					method: "GET",
					path: CASCADE,
					error: CONNECT_FAILED,
				};
				await changeScene({
					page,
					scene: { restFaults: [cascadeFails] },
				});
				await addingToast({
					page,
					action: async () => {
						const refresh = await revealRefreshButton({
							page,
							scroller: GRID_SCROLLER,
							towardTop: true,
						});
						await refresh.click();
					},
				});
			},
		},
	],
};

export const gridProfileFailure: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			{ method: "GET", path: CASCADE, status: 200, body: LAZY_CASCADE },
			{ method: "POST", path: "/v3/profiles", error: CONNECT_FAILED },
		],
	},
	views: [
		{
			id: "browse/grid/load-profile-failed",
			screen: "browse/grid",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				showsLoading(page);
				await chooseNeutralLocation(page);
				await page.locator(GRID_READY).waitFor();
				await toastsShown({ page, count: 1 });
			},
		},
	],
};

export const gridPreferencesUnreadable: Scene = {
	platform: "phone",
	demo: { signedOut: true },
	native: { read_app_data: { answer: UNREADABLE_PREFERENCES } },
	views: [
		{
			id: "browse/grid/settings-unreadable",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await fillSignIn(page);
				await changeScene({ page, scene: { signedOut: false } });
				await page.locator("form button[type=submit]").click();
				await page.getByRole("button", { name: "Try again" }).waitFor();
				await toastsShown({ page, count: 2 });
			},
		},
	],
};

export const rightNow: Scene = {
	platform: "phone",
	views: [
		{
			id: "browse/right-now",
			drive: (page) =>
				visit({
					page,
					path: "/right-now",
					ready: page.getByText("Unimplemented"),
				}),
		},
	],
};
