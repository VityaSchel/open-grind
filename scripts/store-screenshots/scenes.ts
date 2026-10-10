import type { Locator, Page } from "@playwright/test";

import { GRID_READY_SELECTOR, runPaletteCommand } from "../../e2e/support/app";
import { installGpsHarness, locationButton } from "../../e2e/support/gps";
import { PIN_ZOOM } from "../../src/lib/components/location-chooser/constants";
import { freezeClockOnEveryLoad, releaseClock } from "./clock";

const MADRID_GEOHASH = "ezjmgy3qw3vf";
const MAP_ZOOM = 12;
const DEMO_ME_PROFILE_ID = 123456000;
const THEO_PROFILE_ID = 100006;
const PABLO_PROFILE_ID = 100777;
const FILTER_MIN_AGE = 27;

export const scenes: { file: string; open: (page: Page) => Promise<void> }[] = [
	{ file: "1.jpeg", open: openGrid },
	{ file: "2.jpeg", open: openConversationWithTheo },
	{ file: "3.jpeg", open: openTaps },
	{ file: "4.jpeg", open: openFilters },
	{ file: "5.jpeg", open: openPabloProfile },
	{ file: "6.jpeg", open: openLocationPicker },
];

async function visit({
	page,
	path,
	ready,
}: {
	page: Page;
	path: string;
	ready: Locator;
}): Promise<void> {
	await page.goto(path);
	await ready.first().waitFor();
	await releaseClock(page);
}

async function layoutBox(locator: Locator) {
	const box = await locator.boundingBox();
	if (!box) throw new Error("A scene element is not laid out");
	return box;
}

async function scrollHolderBy({
	element,
	distance,
}: {
	element: Locator;
	distance: number;
}): Promise<void> {
	await element.evaluate((node, scrollDistance) => {
		let scroller = node.parentElement;
		while (scroller && getComputedStyle(scroller).overflowY !== "auto") {
			scroller = scroller.parentElement;
		}
		if (!scroller) throw new Error("No scroller holds the element");
		const top = scroller.scrollTop + scrollDistance;
		scroller.scrollTop = top;
		if (Math.abs(scroller.scrollTop - top) > 1) {
			throw new Error("The scroller cannot reach that position");
		}
	}, distance);
}

function profileRows(page: Page) {
	return page.locator('.pull-scroller a[href^="/profile/"]');
}

export async function launch(page: Page): Promise<void> {
	await freezeClockOnEveryLoad(page);
	await installGpsHarness(page);
	await visit({ page, path: "/", ready: page.locator("nav a") });
	await runPaletteCommand(page, `@${MADRID_GEOHASH}`);
	await page.locator(GRID_READY_SELECTOR).waitFor();
	await openTaps(page);
}

async function openGrid(page: Page): Promise<void> {
	await visit({ page, path: "/", ready: profileRows(page) });
}

async function openConversationWithTheo(page: Page): Promise<void> {
	await visit({
		page,
		path: `/chat/${THEO_PROFILE_ID}:${DEMO_ME_PROFILE_ID}`,
		ready: page.getByText("Did you catch it?"),
	});
}

async function openTaps(page: Page): Promise<void> {
	await visit({ page, path: "/interest/taps", ready: profileRows(page) });
}

async function setMinimumAge(slider: Locator): Promise<void> {
	const startAge = Number(await slider.getAttribute("aria-valuenow"));
	for (let age = startAge; age < FILTER_MIN_AGE; age++) {
		await slider.press("ArrowRight");
	}
	const age = await slider.getAttribute("aria-valuenow");
	if (age !== String(FILTER_MIN_AGE)) {
		throw new Error(
			`The minimum age slider reads ${age} after stepping from ${startAge} to ${FILTER_MIN_AGE}`,
		);
	}
}

async function openFilters(page: Page): Promise<void> {
	await openGrid(page);
	await page.locator(GRID_READY_SELECTOR).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByRole("button", { name: "Apply" }).waitFor();
	await sheet.getByRole("checkbox", { name: "Online", exact: true }).click();
	await setMinimumAge(sheet.getByRole("slider", { name: "Minimum age" }));
	await sheet.getByRole("button", { name: "Versatile", exact: true }).click();
	await sheet.getByRole("checkbox", { name: "Tags" }).click();
	await sheet.getByRole("button", { name: "Fitness", exact: true }).click();

	const tagSearch = sheet.getByRole("searchbox", { name: "Search tags" });
	const [tagSearchBox, footerBox] = await Promise.all([
		layoutBox(tagSearch),
		layoutBox(sheet.locator('[data-slot="sheet-footer"]')),
	]);
	await scrollHolderBy({
		element: tagSearch,
		distance: tagSearchBox.y - footerBox.y,
	});
}

async function openPabloProfile(page: Page): Promise<void> {
	const stats = page.getByText("Stats", { exact: true });
	await visit({ page, path: `/profile/${PABLO_PROFILE_ID}`, ready: stats });
	const composer = page.locator("nav", {
		has: page.getByRole("link", { name: "Write a message…" }),
	});
	const [statsBox, composerBox] = await Promise.all([
		layoutBox(stats),
		layoutBox(composer),
	]);
	await scrollHolderBy({
		element: stats,
		distance: statsBox.y + statsBox.height - composerBox.y,
	});
}

async function mapTilesShown({
	page,
	zoom,
}: {
	page: Page;
	zoom: number;
}): Promise<void> {
	await page.waitForFunction((level) => {
		const tiles = [
			...document.querySelectorAll<HTMLImageElement>(".leaflet-tile"),
		];
		return (
			!document.querySelector(".leaflet-zoom-anim") &&
			tiles.length > 0 &&
			tiles.every(
				(tile) =>
					new URL(tile.src).pathname.startsWith(`/${level}/`) &&
					tile.classList.contains("leaflet-tile-loaded") &&
					tile.style.opacity === "1",
			)
		);
	}, zoom);
}

async function openLocationPicker(page: Page): Promise<void> {
	await openGrid(page);
	await locationButton(page).click();
	const map = page.locator(".leaflet-container");
	await map.locator(".leaflet-marker-icon").waitFor();
	await mapTilesShown({ page, zoom: PIN_ZOOM });
	for (let zoom = PIN_ZOOM - 1; zoom >= MAP_ZOOM; zoom--) {
		await map.locator(".leaflet-control-zoom-out").click();
		await mapTilesShown({ page, zoom });
	}
}
