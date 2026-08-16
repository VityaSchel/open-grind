import { expect, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";

const CONVERSATION_LINK = 'a[href^="/chat/1"]';
const FAVORITE_TAP = "/profile/100013";
const PLAIN_TAP = "/profile/100009";

function starIn(page: Page, rowHref: string) {
	return page.locator(`a[href="${rowHref}"] [data-slot="favorite-star"]`);
}

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

test("only the favorited conversation is starred", async ({ page }) => {
	await page.goto("/chat");
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });

	await expect(starIn(page, DEMO_CONVERSATION).first()).toBeVisible();
	await expect(
		page
			.locator(`a[href="${DEMO_CONVERSATION}"] .sr-only`, {
				hasText: "Favorite",
			})
			.first(),
	).toBeAttached();

	const hrefs = await page
		.locator(CONVERSATION_LINK)
		.evaluateAll((links) =>
			links.map((link) => link.getAttribute("href") ?? ""),
		);
	const other = [...new Set(hrefs)].find((h) => h !== DEMO_CONVERSATION);
	expect(other).toBeDefined();

	await expect(starIn(page, other!)).toHaveCount(0);
});

test("a muted favorite shows the star before the name and keeps its bell", async ({
	page,
}) => {
	await page.goto("/chat");
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });

	const title = page
		.locator(`a[href="${DEMO_CONVERSATION}"] [data-slot="item-title"]`)
		.first();
	await expect(title.locator('[data-slot="favorite-star"]')).toBeVisible();
	await expect(title.locator("svg")).toHaveCount(2);

	const starFirst = await title.evaluate((node) => {
		const svgs = [...node.querySelectorAll("svg")];
		return svgs[0]?.getAttribute("data-slot") === "favorite-star";
	});
	expect(starFirst).toBe(true);
});

test("received taps star the favorited profiles only", async ({ page }) => {
	await page.goto("/interest/taps");
	await page
		.locator(`a[href="${FAVORITE_TAP}"]`)
		.first()
		.waitFor({ timeout: 120_000 });

	await expect(starIn(page, FAVORITE_TAP).first()).toBeVisible();
	await expect(page.locator(`a[href="${PLAIN_TAP}"]`).first()).toBeAttached();
	await expect(starIn(page, PLAIN_TAP)).toHaveCount(0);
});
