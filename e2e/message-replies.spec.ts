import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const CONVERSATION = "/chat/100001:123456000";
const MESSAGE_ROW = '[role="button"][tabindex="0"]';
const QUOTE = '[data-slot="message-quote"]';

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
	await page.goto(CONVERSATION);
	await page.locator(MESSAGE_ROW).first().waitFor();
});

test("every message row occupies real space", async ({ page }) => {
	const rows = page.locator(MESSAGE_ROW);
	const count = await rows.count();
	expect(count).toBeGreaterThan(0);

	for (let index = 0; index < count; index++) {
		const box = await rows.nth(index).boundingBox();
		expect(box?.height ?? 0).toBeGreaterThan(0);
	}
});

test("replying quotes the message it answers", async ({ page }) => {
	const quotesBefore = await page.locator(QUOTE).count();

	await page.locator(MESSAGE_ROW).first().click({ button: "right" });
	await page.getByRole("button", { name: "Reply" }).click();

	const replyBar = page.getByLabel("Cancel reply");
	await expect(replyBar).toBeVisible();

	await page.getByRole("textbox").fill("quoting you");
	await page.getByRole("textbox").press("Enter");

	await expect(page.getByText("quoting you")).toBeVisible();
	await expect(page.locator(QUOTE)).toHaveCount(quotesBefore + 1);
	await expect(replyBar).toBeHidden();
});

test("cancelling a reply leaves the message unquoted", async ({ page }) => {
	const quotesBefore = await page.locator(QUOTE).count();

	await page.locator(MESSAGE_ROW).first().click({ button: "right" });
	await page.getByRole("button", { name: "Reply" }).click();
	await page.getByLabel("Cancel reply").click();

	await expect(page.getByLabel("Cancel reply")).toBeHidden();

	await page.getByRole("textbox").fill("just a message");
	await page.getByRole("textbox").press("Enter");

	await expect(page.getByText("just a message")).toBeVisible();
	await expect(page.locator(QUOTE)).toHaveCount(quotesBefore);
});
