import { expect, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import { installTauriShim } from "./support/app";
import { routeDemoThroughFaultHook } from "./support/demo-faults";
import {
	goToRightNow,
	RIGHT_NOW_FEED_TIMEOUT,
	rightNowJoinPill,
} from "./support/right-now";

const POST_TEXT = "Coffee at mine?";
const OFF_NOTE = "Your timer keeps running while you're off.";
const ENTITLEMENTS_PATH = "/v1/rightnow/entitlements/posts";

const articles = (page: Page) => page.getByRole("article");
const ownCard = (page: Page) =>
	articles(page).filter({
		has: page.getByRole("button", { name: "Edit your post" }),
	});
const timeLeftPill = (page: Page) =>
	page.getByRole("button", { name: /^Your Right Now post, .+ left$/ });
const postSheet = (page: Page) =>
	page.getByRole("dialog", { name: "Right Now" });
const showMyPost = (page: Page) =>
	postSheet(page).getByRole("switch", { name: "Show my post" });

async function closeSheet(page: Page): Promise<void> {
	await expect(showMyPost(page)).toBeEnabled();
	await page.keyboard.press("Escape");
	await expect(postSheet(page)).toBeHidden();
}

async function join(page: Page): Promise<void> {
	await rightNowJoinPill(page).click({ timeout: RIGHT_NOW_FEED_TIMEOUT });
	const confirm = page.getByRole("alertdialog", { name: "Join Right Now?" });
	await confirm.getByRole("button", { name: "Join now" }).click();
	await expect(confirm).toBeHidden();
	await expect(postSheet(page)).toBeVisible();
	await closeSheet(page);
	await expect(ownCard(page)).toHaveCount(1, {
		timeout: RIGHT_NOW_FEED_TIMEOUT,
	});
}

async function setShown(page: Page, shown: boolean): Promise<void> {
	await timeLeftPill(page).click();
	await showMyPost(page).setChecked(shown);
	await expect(postSheet(page).getByText(OFF_NOTE)).toHaveCount(
		shown ? 0 : 1,
	);
	await closeSheet(page);
}

test.describe("our own Right Now post in the demo", () => {
	test.beforeEach(async ({ page }) => {
		test.setTimeout(240_000);
		await installTauriShim(page);
		await goToRightNow(page);
		await articles(page)
			.first()
			.waitFor({ timeout: RIGHT_NOW_FEED_TIMEOUT });
	});

	test("joining lists our Joined card and shows the time left on the pill", async ({
		page,
	}) => {
		await join(page);

		await expect(ownCard(page).getByRole("heading")).toHaveText(/joined$/i);
		await expect(
			ownCard(page).getByRole("link", { name: /^Message/ }),
		).toHaveCount(0);
		await expect(timeLeftPill(page)).toBeVisible();
		await expect(page.getByRole("button", { name: /^Join/ })).toHaveCount(
			0,
		);
	});

	test("text saved from Edit heads our card", async ({ page }) => {
		await join(page);

		await ownCard(page)
			.getByRole("button", { name: "Edit your post" })
			.click();
		const sheet = postSheet(page);
		await sheet.getByRole("textbox", { name: "Text" }).fill(POST_TEXT);
		await sheet.getByRole("button", { name: "Save" }).click();
		await expect(sheet).toBeHidden();

		await expect(ownCard(page).getByRole("heading")).toHaveText(POST_TEXT, {
			timeout: RIGHT_NOW_FEED_TIMEOUT,
		});
	});

	test("turning off takes our card out of the feed until it is turned back on", async ({
		page,
	}) => {
		await join(page);

		await setShown(page, false);

		await expect(ownCard(page)).toHaveCount(0, {
			timeout: RIGHT_NOW_FEED_TIMEOUT,
		});
		await expect(
			page.getByRole("button", {
				name: /^Your Right Now post, off, .+ left$/,
			}),
		).toBeVisible();

		await setShown(page, true);

		await expect(ownCard(page)).toHaveCount(1, {
			timeout: RIGHT_NOW_FEED_TIMEOUT,
		});
	});
});

test.describe("an area with no free posts left", () => {
	test.use({ baseURL: DEV_SERVER_URL });

	test("disables Join and says why", async ({ page }) => {
		test.setTimeout(240_000);
		await installTauriShim(page);
		await page.addInitScript((path) => {
			Object.assign(window, {
				__demoFault: (request: { path: string }) =>
					request.path.startsWith(path)
						? { status: 200, body: { type: "GRANTED", count: 0 } }
						: undefined,
			});
		}, ENTITLEMENTS_PATH);
		await routeDemoThroughFaultHook(page);
		await goToRightNow(page);

		const join = page.getByRole("button", {
			name: "Join · 0 free. No free posts left in this area",
		});
		await expect(join).toBeDisabled({ timeout: RIGHT_NOW_FEED_TIMEOUT });
		await expect(join).toHaveText("Join · 0 free");
	});
});
