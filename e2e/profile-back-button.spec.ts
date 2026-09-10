import { expect, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";

const DEMO_PROFILE = "/profile/100001";
const BROWSE_URL = /\/$/;
const PROFILE_SCROLLER = '[data-slot="profile-scroller"]';
const CORNER_GAP = 12;
const CUTOUT = 24;

function backLink(page: Page) {
	return page.getByRole("link", { name: "Back", exact: true });
}

async function openProfileDirectly(page: Page): Promise<void> {
	await page.goto(DEMO_PROFILE);
	await page.getByLabel("Profile menu").waitFor({ timeout: 120_000 });
}

function backLinkIsTopmost(page: Page): Promise<boolean> {
	return backLink(page).evaluate((link) => {
		const { left, top, width, height } = link.getBoundingClientRect();
		const hit = document.elementFromPoint(
			left + width / 2,
			top + height / 2,
		);
		return hit !== null && link.contains(hit);
	});
}

test.beforeEach(async ({ page }) => {
	test.setTimeout(180_000);
	await serveImages(page, CHAT_MEDIA_HOST);
	await serveImages(page, AVATAR_HOST);
	await installTauriShim(page);
});

test("returns to the screen the profile was opened from", async ({ page }) => {
	await page.goto(DEMO_CONVERSATION);
	const profileLink = page.locator(`a[href="${DEMO_PROFILE}"]`).first();
	await profileLink.waitFor({ timeout: 120_000 });
	await profileLink.click();
	await page.getByLabel("Profile menu").waitFor({ timeout: 30_000 });

	await backLink(page).click();

	await expect(page).toHaveURL(new RegExp(`${DEMO_CONVERSATION}$`));
	expect(
		await page.evaluate(() => navigation.canGoForward),
		"the profile stays a forward entry instead of being stacked again",
	).toBe(true);
});

test("opens Browse when the profile was the first screen", async ({ page }) => {
	await openProfileDirectly(page);

	await backLink(page).click();

	await expect(page).toHaveURL(BROWSE_URL);
});

test("opens Browse after coming back to a profile that was the first screen", async ({
	page,
}) => {
	await openProfileDirectly(page);
	await page.getByRole("link", { name: "Write a message..." }).click();
	await expect(page).toHaveURL(/\/chat\//);
	await page.goBack();
	await page.getByLabel("Profile menu").waitFor({ timeout: 30_000 });

	await backLink(page).click();

	await expect(page).toHaveURL(BROWSE_URL);
});

test("keeps working after a client-side hop to another profile", async ({
	page,
}) => {
	await openProfileDirectly(page);
	await page.keyboard.press("ControlOrMeta+k");
	const palette = page.getByRole("combobox");
	await palette.waitFor();
	await palette.fill("#100002");
	await page.getByRole("option", { name: "#100002" }).click();
	await expect(page).toHaveURL(/\/profile\/100002$/);
	await page.getByLabel("Profile menu").waitFor({ timeout: 30_000 });

	await backLink(page).click();
	await expect(page).toHaveURL(new RegExp(`${DEMO_PROFILE}$`));
	await backLink(page).click();

	await expect(page).toHaveURL(BROWSE_URL);
});

test("stays pinned to the top-left corner while the profile scrolls", async ({
	page,
}) => {
	await openProfileDirectly(page);
	const topInset = await page.evaluate(
		() =>
			parseFloat(
				getComputedStyle(document.documentElement).getPropertyValue(
					"--safe-area-top",
				),
			) || 0,
	);
	const resting = await backLink(page).boundingBox();
	expect(topInset, "test insets are active").toBeGreaterThan(0);
	expect(resting?.x, "clears the left edge").toBeCloseTo(CORNER_GAP, 0);
	expect(resting?.y, "clears the status bar").toBeCloseTo(
		topInset + CORNER_GAP,
		0,
	);

	await page
		.locator(PROFILE_SCROLLER)
		.evaluate((scroller) =>
			scroller.scrollTo({ top: scroller.scrollHeight }),
		);
	await expect
		.poll(() =>
			page.locator(PROFILE_SCROLLER).evaluate((el) => el.scrollTop),
		)
		.toBeGreaterThan(0);

	expect(await backLink(page).boundingBox()).toEqual(resting);
	expect(await backLinkIsTopmost(page), "nothing scrolls over it").toBe(true);
});

test("clears a side cutout", async ({ page }) => {
	await openProfileDirectly(page);
	await page.evaluate(
		(cutout) =>
			document.documentElement.style.setProperty(
				"--safe-area-left",
				`${cutout}px`,
			),
		CUTOUT,
	);

	const box = await backLink(page).boundingBox();

	expect(box?.x, "the button clears the cutout plus its own gap").toBeCloseTo(
		CUTOUT + CORNER_GAP,
		0,
	);
});

test("goes back from the hidden version of the profile", async ({ page }) => {
	await openProfileDirectly(page);
	await page.getByLabel("Profile menu").click();
	await page.getByRole("menuitem", { name: "Hide profile" }).click();
	await expect(page.getByText("You hid this profile.")).toBeVisible();

	await backLink(page).click();

	await expect(page).toHaveURL(BROWSE_URL);
});

test("sits under the photo viewer", async ({ page }) => {
	await openProfileDirectly(page);
	await page.locator(".carousel .item[href]").first().click();
	await page.locator(".pswp").waitFor({ timeout: 30_000 });

	await expect.poll(() => backLinkIsTopmost(page)).toBe(false);
});
