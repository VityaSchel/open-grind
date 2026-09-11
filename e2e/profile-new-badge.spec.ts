import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const NEW_PROFILE = "/profile/100005";
const ESTABLISHED_PROFILE = "/profile/100001";
const OWN_NEW_PROFILE = "/profile/123456000";
const DISTANT_NEW_PROFILE = "/profile/100000";
const NEW_BADGE = '[data-slot="new-badge"]';
const STATUS_ROW = '[data-slot="profile-status-row"]';
const ENLARGED_ROOT_FONT_PX = 22;

async function openProfile(
	page: Page,
	{ url, ready }: { url: string; ready: string },
): Promise<void> {
	await page.goto(url);
	await page.getByLabel(ready).waitFor({ timeout: 120_000 });
}

test.beforeEach(async ({ page }) => {
	test.setTimeout(180_000);
	await installTauriShim(page);
});

test("marks a recently joined profile as new", async ({ page }) => {
	await openProfile(page, { url: NEW_PROFILE, ready: "Profile menu" });

	await expect(page.locator(NEW_BADGE)).toHaveText("New");
});

test("leaves an established profile unmarked", async ({ page }) => {
	await openProfile(page, {
		url: ESTABLISHED_PROFILE,
		ready: "Profile menu",
	});

	await expect(page.locator(NEW_BADGE)).toHaveCount(0);
});

test("marks our own profile the same way", async ({ page }) => {
	await openProfile(page, { url: OWN_NEW_PROFILE, ready: "Edit profile" });

	await expect(page.locator(NEW_BADGE)).toHaveText("New");
});

test("wraps the status row instead of clipping the badge at large text sizes", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 800 });
	await openProfile(page, {
		url: DISTANT_NEW_PROFILE,
		ready: "Profile menu",
	});
	await expect(page.locator(NEW_BADGE)).toHaveText("New");

	const overhang = await page
		.locator(STATUS_ROW)
		.evaluate((row, fontSize) => {
			document.documentElement.style.fontSize = `${fontSize}px`;
			return row.scrollWidth - row.clientWidth;
		}, ENLARGED_ROOT_FONT_PX);

	expect(overhang).toBeLessThanOrEqual(0);
});
