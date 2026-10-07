import { expect, type Page, test } from "@playwright/test";

import { MEDIA_SLOT_CELL as CELL } from "./support/albums";
import { backLink, FIRST_ROUTE_COMPILE_MS } from "./support/app";
import { AVATAR_HOST, serveImages } from "./support/media";
import { openSettings, stackSettled } from "./support/page-stack";

const NAVBAR_AVATAR = 'nav[aria-label="Main"] a[aria-label="Me"] img';
const LOADED_SRC = /^https:\/\/api\.dicebear\.com\//;

declare global {
	interface Window {
		__sameDocument?: boolean;
	}
}

function photoSources(page: Page) {
	return page
		.locator(`${CELL} img`)
		.evaluateAll((nodes) =>
			nodes.map((node) => node.getAttribute("src") ?? ""),
		);
}

async function centerOf(page: Page, index: number) {
	const box = await page.locator(CELL).nth(index).boundingBox();
	expect(box, `cell ${index} is laid out`).not.toBeNull();
	return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

test("the navbar avatar shows the main photo saved in Edit profile without a reload", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await serveImages(page, AVATAR_HOST);
	await openSettings(page);

	const avatar = page.locator(NAVBAR_AVATAR);
	await expect(avatar).toHaveAttribute("src", LOADED_SRC);
	const before = await avatar.getAttribute("src");
	await page.evaluate(() => (window.__sameDocument = true));

	await page.getByRole("link", { name: "View your profile" }).click();
	await page.getByRole("link", { name: "Edit profile" }).click();
	await expect(page).toHaveURL(/\/settings\/profile$/);
	await stackSettled(page);
	await page
		.locator(CELL)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	const cellImages = page.locator(`${CELL} img`);
	await expect(cellImages.nth(1)).toHaveAttribute("src", LOADED_SRC);

	const photos = await photoSources(page);
	expect(photos[0], "the navbar shows the main photo").toBe(before);
	expect(photos[1]).not.toBe(before);

	const second = await centerOf(page, 1);
	const first = await centerOf(page, 0);
	await page.mouse.move(second.x, second.y);
	await page.mouse.down();
	await page.mouse.move(first.x, first.y, { steps: 12 });
	await page.mouse.up();
	await expect(cellImages.first()).toHaveAttribute("src", photos[1]!);

	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Profile updated")).toBeVisible();

	await backLink(page).click();
	await stackSettled(page);
	await expect(page).not.toHaveURL(/\/settings\/profile$/);

	await expect(avatar).toHaveAttribute("src", photos[1]!);
	expect(
		await page.evaluate(() => window.__sameDocument),
		"the page never reloaded",
	).toBe(true);
});
