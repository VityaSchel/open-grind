import { expect, type Locator, type Page, test } from "@playwright/test";

import { openTaps, PAGER, swipeAcross, VIEWS } from "./support/interest-pager";
import {
	openGridProfile,
	profilePager,
	swipeToNext,
} from "./support/profile-pager";

declare global {
	interface Window {
		__blurred?: boolean;
	}
}

const NAVIGATION_SETTLE_MS = 500;

test.describe.configure({ timeout: 300_000 });

async function watchBlur(target: Locator): Promise<void> {
	await target.evaluate((element) => {
		window.__blurred = false;
		element.addEventListener("blur", () => {
			window.__blurred = true;
		});
	});
}

async function expectFocusKept(page: Page, target: Locator): Promise<void> {
	await page.waitForTimeout(NAVIGATION_SETTLE_MS);
	expect(
		await page.evaluate(() => window.__blurred),
		"the navigation must not blur the focused element",
	).toBe(false);
	await expect(target).toBeFocused({ timeout: 0 });
}

test("a tab tap keeps focus on the pressed tab", async ({ page }) => {
	await openTaps(page);
	const views = page.getByRole("link", { name: "Views" });
	await views.focus();
	await watchBlur(views);

	await views.click();

	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	await expect
		.poll(() => page.locator(PAGER).evaluate((el) => el.scrollLeft))
		.toBe(0);
	await expectFocusKept(page, views);
});

test("an interest pager swipe keeps focus where it was", async ({ page }) => {
	await openTaps(page);
	const taps = page.getByRole("link", { name: "Taps" });
	await taps.focus();
	await watchBlur(taps);
	const width = await page.locator(PAGER).evaluate((el) => el.clientWidth);

	await swipeAcross(page, { distancePx: Math.round(width * 0.75) });

	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	await expectFocusKept(page, taps);
});

test("a profile pager swipe keeps focus on the pager", async ({ page }) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const pager = profilePager(page);
	await pager.focus();
	await watchBlur(pager);

	await swipeToNext(page, { tiles, landing: 2 });

	await expectFocusKept(page, pager);
});
