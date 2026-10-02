import { expect, type Page, test } from "@playwright/test";

import {
	ensureGridLocation,
	FIRST_ROUTE_COMPILE_MS,
	GRID_READY_SELECTOR,
	installTauriShim,
} from "./support/app";
import {
	installPersistentAppData,
	storedPreferences,
} from "./support/app-data";

const PICKED_IN_IMPERIAL = { height: [130, 241], weight: [42.2, 272] };

test.describe.configure({ timeout: 240_000 });

async function chooseUnits({
	page,
	units,
}: {
	page: Page;
	units: "Imperial" | "Metric";
}) {
	await page.goto("/settings/app");
	const option = page.getByRole("radio", { name: units });
	await option.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await option.click();
	await expect
		.poll(async () => (await storedPreferences(page))?.units)
		.toBe(units.toLowerCase());
}

async function openAllFilters(page: Page) {
	await page.goto("/");
	await page
		.locator("nav a")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await ensureGridLocation(page);
	await page.locator(GRID_READY_SELECTOR).click();
	const apply = page.getByRole("button", { name: "Apply" });
	await apply.waitFor();
	return apply;
}

async function savedRanges(page: Page) {
	const filters = (await storedPreferences(page))?.gridSearchFilters as
		| { height: number[]; weight: number[] }
		| undefined;
	return filters && { height: filters.height, weight: filters.weight };
}

async function stepThumb({
	page,
	thumb,
	key,
	labels,
}: {
	page: Page;
	thumb: string;
	key: "ArrowLeft" | "ArrowRight";
	labels: string[];
}) {
	const slider = page.getByRole("slider", { name: thumb });
	await slider.focus();
	for (const label of labels) {
		await page.keyboard.press(key);
		await expect(slider).toHaveAttribute("aria-valuetext", label);
	}
}

async function pickInImperial(page: Page) {
	await chooseUnits({ page, units: "Imperial" });
	const apply = await openAllFilters(page);

	await page.getByRole("checkbox", { name: "Height" }).click();
	await stepThumb({
		page,
		thumb: "Minimum height",
		key: "ArrowRight",
		labels: ["4'1\"", "4'2\"", "4'3\""],
	});
	await page.getByRole("checkbox", { name: "Weight" }).click();
	await stepThumb({
		page,
		thumb: "Minimum weight",
		key: "ArrowRight",
		labels: ["91 lb", "92 lb", "93 lb"],
	});

	await apply.click();
	await expect.poll(() => savedRanges(page)).toEqual(PICKED_IN_IMPERIAL);
}

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
	await installPersistentAppData(page);
});

test("in imperial units the height and weight filters step by whole inches and pounds and save metric values", async ({
	page,
}) => {
	await pickInImperial(page);
});

test("a filter picked in inches and pounds stays as saved in metric units until its own thumb moves", async ({
	page,
}) => {
	await pickInImperial(page);
	await chooseUnits({ page, units: "Metric" });
	const apply = await openAllFilters(page);

	await expect(page.getByText("130 cm - No max")).toBeVisible();
	await expect(page.getByText("42 kg - No max")).toBeVisible();
	expect(await savedRanges(page)).toEqual(PICKED_IN_IMPERIAL);

	await stepThumb({
		page,
		thumb: "Maximum height",
		key: "ArrowLeft",
		labels: ["240 cm"],
	});
	await stepThumb({
		page,
		thumb: "Maximum weight",
		key: "ArrowLeft",
		labels: ["271 kg"],
	});
	await apply.click();

	await expect
		.poll(() => savedRanges(page))
		.toEqual({ height: [130, 240], weight: [42.2, 271] });
});
