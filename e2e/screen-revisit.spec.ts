import { expect, type Page, test } from "@playwright/test";

import { ensureGridLocation, installTauriShim } from "./support/app";

const PROFILE_LINK = 'a[href^="/profile/"]';
const TAPS_PANE = '[data-slot="interest-pane-taps"]';
const GRID_CONTENT = '[data-slot="grid-content"]';
const SCROLLER = ".pull-scroller";
const SCROLL_TARGET = 400;
const RESTORE_TIMEOUT = 60_000;

async function offsetOfMountedScreen(page: Page) {
	await expect(page.locator(SCROLLER)).toHaveCount(1, { timeout: 60_000 });
	return page.locator(SCROLLER).evaluate((el) => el.scrollTop);
}

function countSkeletonsFrom(page: Page) {
	return page.evaluate(() => {
		const seen = { total: 0 };
		Object.assign(window, { __interestSkeletons: seen });
		new MutationObserver((records) => {
			for (const record of records) {
				for (const node of record.addedNodes) {
					if (!(node instanceof Element)) continue;
					if (node.matches('[data-slot="skeleton"]')) seen.total += 1;
					seen.total += node.querySelectorAll(
						'[data-slot="skeleton"]',
					).length;
				}
			}
		}).observe(document.body, { childList: true, subtree: true });
	});
}

function skeletonsSeen(page: Page) {
	return page.evaluate(
		() =>
			(window as unknown as { __interestSkeletons: { total: number } })
				.__interestSkeletons.total,
	);
}

test("reopening Interest keeps the taps list and its scroll offset, with no skeleton", async ({
	page,
}) => {
	test.setTimeout(300_000);
	await installTauriShim(page);
	await page.goto("/interest/taps");
	await page.locator(PROFILE_LINK).first().waitFor({ timeout: 180_000 });

	const taps = page.locator(TAPS_PANE).locator(SCROLLER);
	const offsetOfTaps = () => taps.evaluate((el) => el.scrollTop);
	await taps.evaluate((el, top) => el.scrollTo({ top }), SCROLL_TARGET);
	await expect.poll(offsetOfTaps).toBe(SCROLL_TARGET);

	await page.getByRole("link", { name: "Browse" }).click();
	await expect(page).toHaveURL(/localhost:\d+\/$/);
	await ensureGridLocation(page);
	await page
		.locator(GRID_CONTENT)
		.locator(PROFILE_LINK)
		.first()
		.waitFor({ timeout: 60_000 });

	await countSkeletonsFrom(page);

	await page.getByRole("link", { name: "Interest" }).click();
	await expect(page).toHaveURL(/\/interest\/taps$/);
	await expect(page.locator(PROFILE_LINK).first()).toBeVisible();
	await expect
		.poll(offsetOfTaps, { timeout: RESTORE_TIMEOUT })
		.toBe(SCROLL_TARGET);
	expect(await skeletonsSeen(page)).toBe(0);
});

test("reopening a profile keeps a favorite it was just given", async ({
	page,
}) => {
	test.setTimeout(300_000);
	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 180_000 });
	await ensureGridLocation(page);

	const tile = page.locator(PROFILE_LINK).first();
	await tile.waitFor({ timeout: 60_000 });
	const href = await tile.getAttribute("href");
	await tile.click();
	await expect(page).toHaveURL(/\/profile\/\d+$/);

	const star = page.getByRole("switch");
	await star.waitFor({ timeout: 60_000 });
	const before = await star.getAttribute("aria-checked");
	await star.click();
	await expect(star).not.toHaveAttribute("aria-checked", before ?? "");
	const after = await star.getAttribute("aria-checked");

	await page.goBack();
	await expect(page).toHaveURL(/localhost:\d+\/$/);
	await page.locator(`a[href="${href}"]`).first().click();
	await expect(page).toHaveURL(/\/profile\/\d+$/);
	await star.waitFor({ timeout: 60_000 });

	await expect(star).toHaveAttribute("aria-checked", after ?? "");
});

test("returning to the grid keeps its scroll offset", async ({ page }) => {
	test.setTimeout(300_000);
	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 180_000 });
	await ensureGridLocation(page);
	await page.locator(PROFILE_LINK).first().waitFor({ timeout: 60_000 });

	const scroller = page.locator(SCROLLER);
	await expect
		.poll(() => scroller.evaluate((el) => el.scrollHeight))
		.toBeGreaterThan(SCROLL_TARGET * 3);
	await scroller.evaluate((el, top) => el.scrollTo({ top }), SCROLL_TARGET);
	await expect.poll(() => offsetOfMountedScreen(page)).toBe(SCROLL_TARGET);

	await page.getByRole("link", { name: "Interest" }).click();
	await expect(page).toHaveURL(/\/interest\//);
	await page.locator(PROFILE_LINK).first().waitFor({ timeout: 60_000 });

	await page.getByRole("link", { name: "Browse" }).click();
	await expect(page).toHaveURL(/localhost:\d+\/$/);
	await page.locator(PROFILE_LINK).first().waitFor({ timeout: 60_000 });

	await expect
		.poll(() => offsetOfMountedScreen(page), { timeout: RESTORE_TIMEOUT })
		.toBe(SCROLL_TARGET);
});
