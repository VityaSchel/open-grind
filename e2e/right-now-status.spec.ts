import { expect, test } from "@playwright/test";

import {
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	openGrid,
} from "./support/app";
import { DRAWER } from "./support/drawer";

const HOSTING_AUTHOR = "/profile/100006";
const HOSTING_AUTHOR_CHAT = 'a[href="/chat/100006:123456000"]';
const TILE = 'a[href^="/profile/"]';
const INDICATOR = '[data-slot="right-now-indicator"]';

test.beforeEach(async ({ page }) => {
	test.setTimeout(240_000);
	await installTauriShim(page);
});

test("Browse's Right Now filter lists only tiles marked as on Right Now", async ({
	page,
}) => {
	await openGrid(page);

	await page.getByRole("button", { name: "Right Now", exact: true }).click();

	const tiles = page.locator(TILE);
	await expect(tiles.first()).toBeVisible({
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	await expect
		.poll(async () => {
			const total = await tiles.count();
			const marked = await tiles
				.filter({ has: page.locator(INDICATOR) })
				.count();
			return total > 0 && total === marked;
		})
		.toBe(true);
	await expect(
		tiles.locator(`${INDICATOR}[title="Right Now · Hosting"]`).first(),
	).toBeVisible();
});

test("a hosting author's profile shows the status and the post, and the post can be reported", async ({
	page,
}) => {
	await page.goto(HOSTING_AUTHOR);

	await expect(
		page.locator('[data-slot="profile-right-now-badge"]'),
	).toHaveText("Hosting", { timeout: FIRST_ROUTE_COMPILE_MS });
	const post = page.getByRole("region", { name: "Right Now" });
	await expect(post).toBeVisible();
	await expect(post.getByRole("button", { name: "Edit" })).toHaveCount(0);

	await post.getByRole("button", { name: "Report post" }).click();
	const drawer = page.locator(DRAWER);
	await drawer.waitFor({ timeout: 10_000 });
	await expect(
		drawer.getByRole("heading", { name: "Report post" }),
	).toBeVisible();
});

test("the inbox marks a conversation with someone on Right Now", async ({
	page,
}) => {
	await page.goto("/chat");

	await expect(
		page.locator(`${HOSTING_AUTHOR_CHAT} ${INDICATOR}`),
	).toHaveAttribute("title", "Right Now · Hosting", {
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	await expect(
		page.locator(`a[href="/chat/100001:123456000"] ${INDICATOR}`),
	).toHaveCount(0);
});
