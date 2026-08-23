import { expect, test } from "@playwright/test";

import { ensureGridLocation, installTauriShim } from "./support/app";

const CARD = '.photo-grid a[href^="/profile/"]';
const NAMELESS = { hasText: "Someone" };

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

test("a grid profile without a display name still shows its online dot", async ({
	page,
}) => {
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 180_000 });
	await ensureGridLocation(page);

	const nameless = page.locator(CARD).filter(NAMELESS);
	await expect(nameless.first()).toBeVisible({ timeout: 60_000 });
	await expect(
		nameless.filter({ has: page.locator('[title="Online now"]') }).first(),
	).toBeVisible();
});

test("hidden viewers stay unnamed while named-less viewers do not", async ({
	page,
}) => {
	await page.goto("/interest/views");
	await page.locator("nav a").first().waitFor({ timeout: 180_000 });

	const previews = page
		.locator(".photo-grid > *")
		.filter({ hasText: "Secret admirer" });
	await expect(previews.first()).toBeVisible({ timeout: 60_000 });
	await expect(previews.locator('[data-slot="badge"]')).toHaveCount(0);

	await expect(page.locator(CARD).filter(NAMELESS).first()).toBeVisible();
});
