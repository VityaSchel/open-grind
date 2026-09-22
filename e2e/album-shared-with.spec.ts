import { expect, type Page, test } from "@playwright/test";

import { openAlbums, SHARED_ALBUM } from "./support/albums";
import { TrustedTouch } from "./support/app";

const DRAWER = "[data-vaul-drawer]";
const LIST = "[data-slot=shared-with-list]";

function listMetrics(page: Page) {
	return page.evaluate((list) => {
		const body = document.querySelector<HTMLElement>(list);
		if (!body) return null;
		const rect = body.getBoundingClientRect();
		return {
			scrollTop: Math.round(body.scrollTop),
			scrollable: body.scrollHeight > body.clientHeight + 1,
			left: Math.round(rect.left),
			top: Math.round(rect.top),
			width: Math.round(rect.width),
			height: Math.round(rect.height),
		};
	}, LIST);
}

async function openSharedWith(page: Page) {
	await openAlbums(page);
	await page.locator(SHARED_ALBUM).click();

	const sharedWith = page.getByRole("button", { name: /^Shared with/ });
	await expect(sharedWith).toBeEnabled({ timeout: 30_000 });
	await sharedWith.click();
	await page.locator(DRAWER).waitFor({ timeout: 10_000 });
	await page.getByRole("checkbox").first().waitFor({ timeout: 30_000 });
	await page.waitForTimeout(600);
}

test.describe("album shared-with drawer", () => {
	test("the badge counts everyone the album is shared with", async ({
		page,
	}) => {
		await openAlbums(page);
		await page.locator(SHARED_ALBUM).click();

		await expect(
			page.getByRole("button", { name: /^Shared with/ }),
		).toContainText("13", { timeout: 30_000 });
	});

	test("the list scrolls under touch and the drawer closes under touch", async ({
		page,
	}) => {
		await openSharedWith(page);

		const before = await listMetrics(page);
		expect(before, "the drawer body is present").not.toBeNull();
		expect(before!.scrollable, "the list overflows its drawer").toBe(true);
		expect(before!.scrollTop).toBe(0);

		const touch = await TrustedTouch.attach(page);
		const midX = before!.left + before!.width / 2;
		await touch.drag(
			page,
			{ x: midX, y: before!.top + before!.height - 30 },
			{ x: midX, y: before!.top + 30 },
			{ steps: 24, holdMs: 20 },
		);
		await page.waitForTimeout(500);

		const scrolled = await listMetrics(page);
		expect(
			scrolled!.scrollTop,
			"the finger scrolled the list, not the drawer",
		).toBeGreaterThan(0);
		await expect(
			page.locator(DRAWER),
			"the drawer stayed open",
		).toHaveAttribute("data-state", "open");

		const drawerBox = await page.locator(DRAWER).boundingBox();
		expect(drawerBox).not.toBeNull();
		await touch.drag(
			page,
			{ x: midX, y: drawerBox!.y + 24 },
			{ x: midX, y: drawerBox!.y + 24 + drawerBox!.height },
			{ steps: 24, holdMs: 20 },
		);

		await expect(page.locator(DRAWER)).toBeHidden({ timeout: 10_000 });
	});

	test("unsharing keeps the drawer open", async ({ page }) => {
		await openSharedWith(page);

		const first = page.getByRole("checkbox").first();
		await expect(first).toHaveAttribute("aria-checked", "true");
		await first.click();

		await expect(first).toHaveAttribute("aria-checked", "false");
		await expect(
			page.locator(DRAWER),
			"unsharing is not a dismissal",
		).toHaveAttribute("data-state", "open");
	});
});
