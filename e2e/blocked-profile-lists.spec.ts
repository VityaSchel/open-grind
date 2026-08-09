import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const VIEW_CARD = '.photo-grid a[href^="/profile/"]';

async function blockFirstViewer(page: Page) {
	await installTauriShim(page);
	await page.goto("/interest/views");

	const cards = page.locator(VIEW_CARD);
	await cards.first().waitFor({ timeout: 180_000 });
	const viewedBefore = await cards.count();
	const href = await cards.first().getAttribute("href");

	await cards.first().click();
	await expect(page).toHaveURL(new RegExp(`${href}$`));

	await page.getByLabel("Profile menu").click();
	await page.getByRole("menuitem", { name: "Block profile" }).click();
	await expect(
		page.getByText("You have blocked this profile."),
	).toBeVisible();

	return {
		cards,
		viewedBefore,
		blocked: page.locator(`${VIEW_CARD}[href="${href}"]`),
	};
}

test("blocking a viewer takes them out of the viewed list", async ({
	page,
}) => {
	const { cards, viewedBefore, blocked } = await blockFirstViewer(page);

	await page.goBack();
	await expect(page).toHaveURL(/\/interest\/views$/);

	await expect(blocked).toHaveCount(0);
	await expect(cards).toHaveCount(viewedBefore - 1);
});

test("unblocking a viewer puts them back in the viewed list", async ({
	page,
}) => {
	const { cards, viewedBefore, blocked } = await blockFirstViewer(page);

	await page.getByRole("button", { name: "Unblock" }).click();
	await expect(page.getByLabel("Profile menu")).toBeVisible();

	await page.goBack();
	await expect(page).toHaveURL(/\/interest\/views$/);

	await expect(blocked).toHaveCount(1);
	await expect(cards).toHaveCount(viewedBefore);
});
