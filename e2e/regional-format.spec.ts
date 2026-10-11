import { expect, type Locator, type Page, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS, MESSAGE_ROW } from "./support/app";

const HENRY = "/chat/100009:123456000";
const SCROLLER = '[data-slot="messages-scroller"]';
const TWELVE_HOUR = /^(?:Sent |Read )?\d{1,2}:\d{2} [AP]M$/;
const TWENTY_FOUR_HOUR = /^(?:Sent |Read )?\d{1,2}:\d{2}$/;

async function openHenry(page: Page, { query = "" } = {}): Promise<void> {
	await page.goto(`${HENRY}${query}`);
	await page
		.locator(MESSAGE_ROW)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

const statusLines = (page: Page, pattern: RegExp): Locator =>
	page.locator(SCROLLER).getByText(pattern);

test("prints US times and decimals on an en-US system", async ({ page }) => {
	await openHenry(page);

	await expect(statusLines(page, TWELVE_HOUR).first()).toBeVisible();
	await expect(statusLines(page, TWENTY_FOUR_HOUR)).toHaveCount(0);
	await expect(page.getByText("9.3 km", { exact: true })).toBeVisible();

	const scroller = await page.locator(SCROLLER).boundingBox();
	if (scroller === null) throw new Error("the messages scroller is missing");
	for (const line of await statusLines(page, TWELVE_HOUR).all()) {
		const box = await line.boundingBox();
		if (box === null) continue;
		expect(box.x).toBeGreaterThanOrEqual(scroller.x);
		expect(box.x + box.width).toBeLessThanOrEqual(
			scroller.x + scroller.width,
		);
		expect(
			await line.evaluate((span) => span.getClientRects().length),
		).toBe(1);
	}
});

test("follows a German region with English words", async ({ page }) => {
	await openHenry(page, { query: "?regional=de-DE" });

	await expect(statusLines(page, TWENTY_FOUR_HOUR).first()).toBeVisible();
	await expect(statusLines(page, TWELVE_HOUR)).toHaveCount(0);
	await expect(page.getByText("9,3 km", { exact: true })).toBeVisible();
});

test("follows a 24-hour clock chosen on a US system", async ({ page }) => {
	await openHenry(page, { query: "?regional=en-US-u-hc-h23" });

	await expect(statusLines(page, TWENTY_FOUR_HOUR).first()).toBeVisible();
	await expect(page.getByText("9.3 km", { exact: true })).toBeVisible();
});

test.describe("on a browser set to German", () => {
	test.use({ locale: "de-DE" });

	test("formats like the browser and keeps English words", async ({
		page,
	}) => {
		await openHenry(page);

		await expect(statusLines(page, TWENTY_FOUR_HOUR).first()).toBeVisible();
		await expect(page.getByText("9,3 km", { exact: true })).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Add attachment" }),
		).toBeVisible();
	});
});
