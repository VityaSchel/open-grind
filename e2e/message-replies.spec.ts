import { expect, type Locator, type Page, test } from "@playwright/test";

import { installTauriShim, trackpadSwipe, TrustedTouch } from "./support/app";

const CONVERSATION = "/chat/100001:123456000";
const WITH_AN_UNSENT_MESSAGE = "/chat/100009:123456000";
const MESSAGE_ROW = '[role="button"][tabindex="0"]';
// only an incoming row pads its end, and only incoming rows swipe rightward
const INCOMING_ROW = `${MESSAGE_ROW}.pe-3`;
const SCROLLER = '[data-slot="messages-scroller"]';
const QUOTE = '[data-slot="message-quote"]';
const REPLIABLE = "consectetur adipiscing elit";

async function openConversation(
	page: Page,
	{ path = CONVERSATION, platform = "macos" } = {},
) {
	await installTauriShim(page, { platform });
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

async function hoverIncomingMessage(
	page: Page,
): Promise<{ row: Locator; center: { x: number; y: number } }> {
	const row = page.locator(INCOMING_ROW).last();
	await row.scrollIntoViewIfNeeded();
	const box = await row.boundingBox();
	if (!box) throw new Error("the incoming row has no box");
	const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	await page.mouse.move(center.x, center.y);
	return { row, center };
}

function railOf(row: Locator) {
	return row.locator("xpath=..");
}

test("a trackpad drag past the trigger replies on lift", async ({ page }) => {
	await openConversation(page, { platform: "linux" });
	const { center } = await hoverIncomingMessage(page);

	await trackpadSwipe(page, center, { xDistance: 80 });

	await expect(page.getByLabel("Cancel reply")).toBeVisible();
});

test("a lone sideways jump, the mouse signature, never moves the row", async ({
	page,
}) => {
	await openConversation(page, { platform: "linux" });
	const { row } = await hoverIncomingMessage(page);
	const rail = railOf(row);
	const rest = await rail.evaluate((el) => el.scrollLeft);

	await page.mouse.wheel(-160, 0);

	await page.waitForTimeout(400);
	expect(await rail.evaluate((el) => el.scrollLeft)).toBe(rest);
	await expect(page.getByLabel("Cancel reply")).toHaveCount(0);
});

test("a double click replies, on their message and on ours alike", async ({
	page,
}) => {
	await openConversation(page);

	// beside the bubble, where a double click cannot select a word instead
	const incoming = page.locator(INCOMING_ROW).last();
	const inBox = await incoming.boundingBox();
	if (!inBox) throw new Error("the incoming row has no box");
	await incoming.dblclick({
		position: { x: inBox.width - 24, y: inBox.height / 2 },
	});
	await expect(page.getByLabel("Cancel reply")).toBeVisible();
	await page.getByLabel("Cancel reply").click();

	await page.getByRole("textbox").fill("mine to answer");
	await page.getByRole("textbox").press("Enter");
	const own = page.locator(MESSAGE_ROW).filter({ hasText: "mine to answer" });
	await expect(own).toBeVisible();

	await own.dblclick({ position: { x: 24, y: 12 } });
	await expect(page.getByLabel("Cancel reply")).toBeVisible();
});

test("a scroll that starts leaning sideways still reaches the conversation", async ({
	page,
}) => {
	await openConversation(page, { platform: "linux" });
	await hoverIncomingMessage(page);
	const scroller = page.locator(SCROLLER);
	const from = await scroller.evaluate((el) => el.scrollTop);

	for (let step = 0; step < 3; step++) await page.mouse.wheel(-12, 4);
	for (let step = 0; step < 2; step++) await page.mouse.wheel(0, -300);

	await expect
		.poll(async () => scroller.evaluate((el) => el.scrollTop))
		.toBeLessThan(from);
});

// real touches only: synthetic PointerEvents skip the implicit capture that
// once cancelled every touch drag
test("a touch drag past the trigger replies on lift", async ({ page }) => {
	await openConversation(page, { platform: "android" });
	const row = page.locator(INCOMING_ROW).last();
	await row.scrollIntoViewIfNeeded();
	const box = (await row.boundingBox())!;
	const touch = await TrustedTouch.attach(page);

	await touch.drag(
		page,
		{ x: box.x + 60, y: box.y + box.height / 2 },
		{ x: box.x + 200, y: box.y + box.height / 2 },
		{ steps: 14, holdMs: 16 },
	);

	await expect(page.getByLabel("Cancel reply")).toBeVisible();
});

test("a vertical touch drag scrolls instead of replying", async ({ page }) => {
	await openConversation(page, { platform: "android" });
	const scroller = page.locator(SCROLLER);
	const row = page.locator(INCOMING_ROW).last();
	await row.scrollIntoViewIfNeeded();
	const box = (await row.boundingBox())!;
	const from = await scroller.evaluate((el) => el.scrollTop);
	const touch = await TrustedTouch.attach(page);

	await touch.drag(
		page,
		{ x: box.x + box.width / 2, y: box.y + 10 },
		{ x: box.x + box.width / 2, y: box.y + 180 },
		{ steps: 14, holdMs: 16 },
	);
	await page.waitForTimeout(400);

	expect(await scroller.evaluate((el) => el.scrollTop)).not.toBe(from);
	await expect(page.getByLabel("Cancel reply")).toHaveCount(0);
});

test("an unsent message offers no reply", async ({ page }) => {
	await openConversation(page, { path: WITH_AN_UNSENT_MESSAGE });

	const unsent = page
		.locator(MESSAGE_ROW)
		.filter({ hasText: "Message unsent" });
	await expect(unsent).toHaveCount(1);
	await unsent.click({ button: "right" });

	await expect(page.getByRole("button", { name: "Report" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Reply" })).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "React with fire" }),
	).toHaveCount(0);
	await expect(page.getByText("Double tap to")).toBeHidden();
});
