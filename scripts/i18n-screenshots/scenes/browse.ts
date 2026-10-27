import type { Page } from "@playwright/test";

import {
	GRID_READY_SELECTOR,
	runPaletteCommand,
} from "../../../e2e/support/app";
import { openAllFilters } from "../../../e2e/support/grid-filters";
import { profileTile } from "../../../e2e/support/gps";
import { NEUTRAL_GEOHASH } from "../stubs";
import type { Scene } from ".";
import { visit } from "./visit";

export const LOCATION_TITLE = '[data-slot="empty-title"]';
export const GRID_SCROLLER = '.pull-scroller:has([data-slot="grid-content"])';
export const MAP_SEARCH = '[data-slot="map-controls"] input';
const FILTERS_SCROLLER = '[role="dialog"] [data-slot="grid-filters-scroller"]';

export const chooseLocation: Scene = {
	platform: "phone",
	views: [
		{
			id: "browse/location",
			drive: (page) =>
				visit({ page, path: "/", ready: page.locator(LOCATION_TITLE) }),
		},
		{
			id: "browse/location/map",
			screen: "browse/location",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await page
					.getByRole("button", { name: "Choose on map" })
					.click();
				await page.locator(MAP_SEARCH).waitFor();
			},
		},
	],
};

export async function chooseNeutralLocation(page: Page): Promise<void> {
	await visit({ page, path: "/", ready: page.locator(LOCATION_TITLE) });
	await runPaletteCommand(page, `@${NEUTRAL_GEOHASH}`);
}

export const grid: Scene = {
	platform: "phone",
	views: [
		{
			id: "browse/grid",
			drive: async (page) => {
				await chooseNeutralLocation(page);
				await page.locator(GRID_READY_SELECTOR).waitFor();
				await profileTile(page).nth(8).waitFor();
			},
		},
		{
			id: "browse/filters",
			screen: "browse/grid",
			scroller: FILTERS_SCROLLER,
			drive: (page) => openAllFilters(page),
		},
	],
};
