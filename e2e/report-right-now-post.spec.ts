import { expect, type Locator, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import { DRAWER } from "./support/drawer";
import {
	goToRightNow,
	RIGHT_NOW_FEED_TIMEOUT,
	scrollFeedToBottom,
} from "./support/right-now";

const POST = '[data-slot="right-now-post"]';
const DISCREET_POST = '[data-slot="right-now-discreet-post"]';
const REPORT_POST = "Report post";

async function openReportSheet({
	page,
	card,
}: {
	page: Page;
	card: Locator;
}): Promise<Locator> {
	await card.getByRole("button", { name: REPORT_POST }).click();
	const drawer = page.locator(DRAWER);
	await drawer.waitFor({ timeout: 10_000 });
	await page.waitForTimeout(700);
	await expect(
		drawer.getByRole("heading", { name: REPORT_POST }),
	).toBeVisible();
	return drawer;
}

test.beforeEach(async ({ page }) => {
	test.setTimeout(240_000);
	await installTauriShim(page);
	await goToRightNow(page);
	await page
		.locator(POST)
		.first()
		.waitFor({ timeout: RIGHT_NOW_FEED_TIMEOUT });
});

test("reporting a known author's post files it about the post and blocking takes their posts out of the feed", async ({
	page,
}) => {
	const card = page
		.locator(POST)
		.filter({ has: page.getByRole("button", { name: REPORT_POST }) })
		.first();
	const authorHref = await card
		.getByRole("link", { name: /^View .*profile$/ })
		.getAttribute("href");
	if (authorHref === null) throw new Error("the author link has no href");

	const drawer = await openReportSheet({ page, card });
	await drawer.getByRole("radio", { name: "Harassment or Bullying" }).click();
	await drawer
		.getByRole("textbox", { name: "Details" })
		.fill("keeps posting insults");
	await expect(
		drawer.getByRole("button", { name: "Right Now Image" }),
		"a post report already knows where it happened",
	).toHaveCount(0);
	await drawer.getByRole("button", { name: "Submit report" }).click();

	await expect(
		drawer.getByText("Grindr will review this post."),
	).toBeVisible();
	await drawer.getByRole("button", { name: "Block profile" }).click();
	await expect(page.locator(DRAWER)).toBeHidden();

	await expect(
		page.locator(`${POST} a[href="${authorHref}"]`),
		"the blocked author's posts leave the feed",
	).toHaveCount(0, { timeout: RIGHT_NOW_FEED_TIMEOUT });
	await expect(
		page.locator(POST).first(),
		"everyone else's posts stay",
	).toBeVisible();
});

test("an anonymous post's report offers no block, and reporting it again says the report awaits moderation", async ({
	page,
}) => {
	const discreet = page.locator(DISCREET_POST);
	await expect
		.poll(
			async () => {
				await scrollFeedToBottom(page);
				return discreet.count();
			},
			{ timeout: RIGHT_NOW_FEED_TIMEOUT },
		)
		.toBeGreaterThan(0);
	const card = discreet.first();
	await card.scrollIntoViewIfNeeded();

	const drawer = await openReportSheet({ page, card });
	await drawer.getByRole("radio", { name: "Spam" }).click();
	await drawer.getByRole("button", { name: "Submit report" }).click();

	await expect(
		drawer.getByText("Grindr will review this post."),
	).toBeVisible();
	await expect(
		drawer.getByRole("button", { name: "Block profile" }),
		"an anonymous author cannot be blocked",
	).toHaveCount(0);
	await drawer.getByRole("button", { name: "Done" }).click();
	await expect(page.locator(DRAWER)).toBeHidden();

	await card.getByRole("button", { name: REPORT_POST }).click();

	await expect(page.getByText(/Awaiting moderation$/)).toBeVisible();
	await expect(page.locator(DRAWER)).toBeHidden();
});
