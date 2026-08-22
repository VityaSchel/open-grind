import { expect, type Page, test } from "@playwright/test";

import { setAppDataWriteDelay } from "./support/app-data";

const SLOW_DEVICE_WRITE_MS = 150;
import { positionRequestCount, setGeolocation } from "./support/geolocation";
import {
	frameSamples,
	gpsSwitch,
	launchGrid,
	openChooser,
	PAST_INTERACTIVE_REUSE_MS,
	saveButton,
	startFrameSampler,
} from "./support/gps";

const mapControls = (page: Page) => page.locator('[data-slot="map-controls"]');
const searchBox = (page: Page) => page.locator("#search-place");
const locateButton = (page: Page) => page.locator('[aria-label="Locate me"]');
const zoomControl = (page: Page) => page.locator(".leaflet-control-zoom");
const draggableMap = (page: Page) =>
	page.locator(".leaflet-container.leaflet-grab");
const marker = (page: Page) => page.locator(".leaflet-marker-icon");
const accuracyCircle = (page: Page) => page.locator("path.leaflet-interactive");
const dimmer = (page: Page) => page.locator('[data-slot="map-cover"]');
const spinner = (page: Page) =>
	page.locator('[role="status"][aria-label="Loading"]');

test.beforeEach(async ({ page }) => {
	test.setTimeout(300_000);
	await launchGrid(page);
	await openChooser(page);
	await searchBox(page).waitFor({ timeout: 60_000 });
});

test("the map is frozen while GPS owns the pin, and thaws again", async ({
	page,
}) => {
	await expect(locateButton(page)).toBeVisible();
	await expect(draggableMap(page)).toHaveCount(1);
	await expect(zoomControl(page)).toHaveCount(1);

	await gpsSwitch(page).click();

	await expect(mapControls(page)).toHaveCSS("opacity", "0");
	await expect(mapControls(page)).toHaveCSS("pointer-events", "none");
	await expect(draggableMap(page)).toHaveCount(0);
	await expect(zoomControl(page)).toHaveCount(0);

	await gpsSwitch(page).click();

	await expect(mapControls(page)).toHaveCSS("opacity", "1");
	await expect(searchBox(page)).toBeVisible();
	await expect(locateButton(page)).toBeVisible();
	await expect(draggableMap(page)).toHaveCount(1);
	await expect(zoomControl(page)).toHaveCount(1);
});

test("the toggle recentres the map on the real position", async ({ page }) => {
	const markerStyle = () =>
		page.evaluate(
			() =>
				document
					.querySelector(".leaflet-marker-icon")
					?.getAttribute("style") ?? "",
		);
	await page.locator(".leaflet-marker-icon").waitFor({ timeout: 60_000 });
	const before = await markerStyle();

	await gpsSwitch(page).click();

	await expect.poll(markerStyle).not.toBe(before);
});

test("the map ignores clicks while locked", async ({ page }) => {
	const markerStyle = () =>
		page.evaluate(
			() =>
				document
					.querySelector(".leaflet-marker-icon")
					?.getAttribute("style") ?? "",
		);
	await page.locator(".leaflet-marker-icon").waitFor({ timeout: 60_000 });

	await gpsSwitch(page).click();
	await expect(mapControls(page)).toHaveCSS("opacity", "0");
	const locked = await markerStyle();

	await page
		.locator(".leaflet-container")
		.click({ position: { x: 40, y: 40 } });

	await expect.poll(markerStyle).toBe(locked);
});

test("a pending fix dims the map, spins, and hides the pin", async ({
	page,
}) => {
	await setGeolocation(page, { delayMs: 3000 });
	await expect(marker(page)).toHaveCount(1);

	await gpsSwitch(page).click();

	await expect(dimmer(page)).toHaveCount(1);
	await expect(spinner(page)).toBeVisible();
	await expect(marker(page)).toHaveCount(0);
	await expect(accuracyCircle(page)).toHaveCount(0);

	await expect(accuracyCircle(page)).toHaveCount(1, { timeout: 30_000 });
	await expect(dimmer(page)).toHaveCount(0);
	await expect(spinner(page)).toHaveCount(0);
	await expect(marker(page)).toHaveCount(0);
});

async function circleWidthFor(page: Page, accuracy: number): Promise<number> {
	await setGeolocation(page, { accuracy });
	await gpsSwitch(page).click();
	await expect(accuracyCircle(page)).toHaveCount(1, { timeout: 30_000 });
	const box = (await accuracyCircle(page).boundingBox())!;
	await gpsSwitch(page).click();
	await expect(accuracyCircle(page)).toHaveCount(0);
	return box.width;
}

test("zoom follows precision, so the circle stays legible either way", async ({
	page,
}) => {
	const tight = await circleWidthFor(page, 20);
	const loose = await circleWidthFor(page, 400);

	expect(tight).toBeGreaterThan(30);
	expect(loose).toBeGreaterThan(30);
	expect(tight).toBeLessThan(700);
	expect(loose).toBeLessThan(700);
	expect(loose / tight).toBeLessThan(4);
});

test("the locate button pends on itself, without covering the map", async ({
	page,
}) => {
	await setGeolocation(page, { delayMs: 2000 });
	await expect(marker(page)).toHaveCount(1);
	await locateButton(page).click();

	// disabled proves the request is in flight, so the absent dim is meaningful
	await expect(locateButton(page)).toBeDisabled();
	await expect(dimmer(page)).toHaveCount(0);
	await expect(spinner(page)).toHaveCount(0);
	await expect(marker(page)).toHaveCount(1);

	await expect(locateButton(page)).toBeEnabled({ timeout: 30_000 });
	await expect(marker(page)).toHaveCount(1);
	await expect(accuracyCircle(page)).toHaveCount(0);
});

test("the controls fade back in rather than popping", async ({ page }) => {
	await gpsSwitch(page).click();
	await expect(accuracyCircle(page)).toHaveCount(1, { timeout: 30_000 });
	await expect(mapControls(page)).toHaveCSS("opacity", "0");

	await startFrameSampler(page, {
		selector: '[data-slot="map-controls"]',
		cssProperty: "opacity",
	});
	await gpsSwitch(page).click();
	await expect(mapControls(page)).toHaveCSS("opacity", "1");
	await page.waitForTimeout(100);

	const samples = (await frameSamples(page)).map(Number);
	expect(samples.at(-1)).toBe(1);
	expect(
		samples.filter((value) => value > 0.05 && value < 0.95).length,
	).toBeGreaterThanOrEqual(2);
});

const CAMERA_SETTLE_MS = 2000;

async function settledCircleWidth(page: Page): Promise<number> {
	await expect(accuracyCircle(page)).toHaveCount(1, { timeout: 60_000 });
	await page.waitForTimeout(CAMERA_SETTLE_MS);
	return (await accuracyCircle(page).boundingBox())!.width;
}

test("reopening the chooser keeps the accuracy view", async ({ page }) => {
	await setGeolocation(page, { accuracy: 400 });
	await gpsSwitch(page).click();
	const first = await settledCircleWidth(page);

	await saveButton(page).click();
	await openChooser(page);
	const reopened = await settledCircleWidth(page);

	expect(reopened).toBeGreaterThan(first * 0.8);
	expect(reopened).toBeLessThan(first * 1.25);
});

test("saving with tracking on never flashes the manual marker", async ({
	page,
}) => {
	await gpsSwitch(page).click();
	await expect(accuracyCircle(page)).toHaveCount(1, { timeout: 30_000 });
	await setAppDataWriteDelay(page, SLOW_DEVICE_WRITE_MS);

	await startFrameSampler(page, {
		selector: ".leaflet-marker-icon",
		cssProperty: "opacity",
	});
	await saveButton(page).click();
	await expect(gpsSwitch(page)).toHaveCount(0, { timeout: 10_000 });
	await page.waitForTimeout(200);

	const markerFrames = await frameSamples(page);
	expect(markerFrames.some((sample) => sample !== null)).toBe(false);
});

test("reopening the chooser refreshes a stale fix and re-centers", async ({
	page,
}) => {
	await gpsSwitch(page).click();
	await expect(accuracyCircle(page)).toHaveCount(1, { timeout: 30_000 });
	await saveButton(page).click();
	await expect(gpsSwitch(page)).toHaveCount(0, { timeout: 10_000 });

	await page.waitForTimeout(PAST_INTERACTIVE_REUSE_MS);
	const before = await positionRequestCount(page);
	await setGeolocation(page, {
		coords: { latitude: 52.5245, longitude: 13.405 },
		delayMs: 1500,
	});

	await openChooser(page);
	await expect(dimmer(page)).toHaveCount(1);
	await expect(accuracyCircle(page)).toHaveCount(1, { timeout: 30_000 });
	expect(await positionRequestCount(page)).toBeGreaterThan(before);
});
