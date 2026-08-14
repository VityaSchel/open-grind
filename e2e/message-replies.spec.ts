import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const CONVERSATION = "/chat/100001:123456000";
const WITH_AN_UNSENT_MESSAGE = "/chat/100009:123456000";
const MESSAGE_ROW = '[role="button"][tabindex="0"]';
const QUOTE = '[data-slot="message-quote"]';
const REPLIABLE = "consectetur adipiscing elit";

async function openConversation(page: Page, path = CONVERSATION) {
	await installTauriShim(page);
	await page.goto(path);
	await page.locator(MESSAGE_ROW).first().waitFor();
}

async function replyToAMessage(page: Page) {
	await page
		.locator(MESSAGE_ROW)
		.filter({ hasText: REPLIABLE })
		.click({ button: "right" });
	await page.getByRole("button", { name: "Reply" }).click();
}

test("every message row occupies real space", async ({ page }) => {
	await openConversation(page);
	const rows = page.locator(MESSAGE_ROW);
	const count = await rows.count();
	expect(count).toBeGreaterThan(0);

	for (let index = 0; index < count; index++) {
		const box = await rows.nth(index).boundingBox();
		expect(box?.height ?? 0).toBeGreaterThan(0);
	}
});

test("replying quotes the message it answers", async ({ page }) => {
	await openConversation(page);
	const quotesBefore = await page.locator(QUOTE).count();

	await replyToAMessage(page);

	const replyBar = page.getByLabel("Cancel reply");
	await expect(replyBar).toBeVisible();

	await page.getByRole("textbox").fill("quoting you");
	await page.getByRole("textbox").press("Enter");

	await expect(page.getByText("quoting you")).toBeVisible();
	await expect(page.locator(QUOTE)).toHaveCount(quotesBefore + 1);
	await expect(replyBar).toBeHidden();
});

test("cancelling a reply leaves the message unquoted", async ({ page }) => {
	await openConversation(page);
	const quotesBefore = await page.locator(QUOTE).count();

	await replyToAMessage(page);
	await page.getByLabel("Cancel reply").click();

	await expect(page.getByLabel("Cancel reply")).toBeHidden();

	await page.getByRole("textbox").fill("just a message");
	await page.getByRole("textbox").press("Enter");

	await expect(page.getByText("just a message")).toBeVisible();
	await expect(page.locator(QUOTE)).toHaveCount(quotesBefore);
});

test("an unsent message offers no reply", async ({ page }) => {
	await openConversation(page, WITH_AN_UNSENT_MESSAGE);

	const unsent = page
		.locator(MESSAGE_ROW)
		.filter({ hasText: "Message unsent" });
	await expect(unsent).toHaveCount(1);
	await unsent.click({ button: "right" });

	await expect(page.getByRole("button", { name: "Report" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Reply" })).toHaveCount(0);
});
