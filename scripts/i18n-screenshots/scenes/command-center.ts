import type { Page } from "@playwright/test";

import { commandCenterShortcut } from "../../../e2e/support/app";
import type { Scene, SceneView } from ".";
import { LOCATION_TITLE } from "./browse";
import { showGrid } from "./browse-states";
import { failClipboard } from "./faults";
import { addingToast } from "./toast";
import { visit } from "./visit";

const FILTER_ERRORS = [
	"color=blue",
	"online=maybe",
	"ageMin=abc",
	"height=300-400",
	"weight=80",
	"tribes=",
	"bodyType=99",
	"genders=abc",
].join("&");
const COPY_LOCATION = "Copy currently selected location";
const COPY_OPTION = '[role="option"][data-value="@copy"][aria-selected="true"]';
const DESKTOP_GRID = "feedback/network-blocked/grid";

function palette(page: Page) {
	return page.getByRole("combobox");
}

async function decodeImages(page: Page): Promise<void> {
	await page.evaluate(() =>
		Promise.all(
			[...document.images].map((image) =>
				image.decode().catch(() => undefined),
			),
		),
	);
}

async function openPalette(page: Page): Promise<void> {
	await page.keyboard.press(await commandCenterShortcut(page));
	await palette(page).waitFor();
}

async function typeCommand({
	page,
	command,
	shows,
}: {
	page: Page;
	command: string;
	shows: string;
}): Promise<void> {
	await palette(page).fill(command);
	await page.getByRole("dialog").getByText(shows).first().waitFor();
}

function commandView({
	id,
	command,
	shows,
}: {
	id: string;
	command: string;
	shows: string;
}): SceneView {
	return { id, drive: (page) => typeCommand({ page, command, shows }) };
}

async function offerCopy(page: Page): Promise<void> {
	await typeCommand({ page, command: "@", shows: COPY_LOCATION });
	await page.locator(COPY_OPTION).waitFor();
}

function copyOffered(page: Page): Promise<void> {
	return addingToast({
		page,
		action: () => page.locator(COPY_OPTION).click(),
	});
}

export const commandCenter: Scene = {
	platform: "desktop",
	views: [
		{
			id: "command-center",
			drive: async (page) => {
				await visit({
					page,
					path: "/",
					ready: page.locator(LOCATION_TITLE),
				});
				await decodeImages(page);
				await openPalette(page);
			},
		},
		commandView({
			id: "command-center/filter-grid",
			command: "?",
			shows: "Type a Grid query",
		}),
		commandView({
			id: "command-center/filter-grid/apply",
			command: "?online=true&fresh=false",
			shows: "Press Enter to apply 2 filters",
		}),
		commandView({
			id: "command-center/filter-grid/errors",
			command: `?${FILTER_ERRORS}`,
			shows: "Fix the highlighted filters to apply",
		}),
		commandView({
			id: "command-center/open-profile",
			command: "#",
			shows: "Enter the profile ID to search",
		}),
		commandView({
			id: "command-center/quick-go-to",
			command: "/",
			shows: "Quick go to…",
		}),
		commandView({
			id: "command-center/set-location",
			command: "@",
			shows: "to set your location",
		}),
		commandView({
			id: "command-center/unknown",
			command: "xyz",
			shows: "Unknown command",
		}),
	],
};

export const locationCopy: Scene = {
	platform: "desktop",
	views: [
		{
			id: "command-center/copy-location",
			screen: DESKTOP_GRID,
			drive: async (page) => {
				await showGrid(page);
				await openPalette(page);
				await offerCopy(page);
			},
		},
		{
			id: "command-center/copy-location/copied",
			screen: DESKTOP_GRID,
			survivesLocaleSwitch: false,
			drive: copyOffered,
		},
		{
			id: "command-center/copy-location/failed",
			screen: DESKTOP_GRID,
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await failClipboard(page);
				await openPalette(page);
				await offerCopy(page);
				await copyOffered(page);
			},
		},
	],
};
