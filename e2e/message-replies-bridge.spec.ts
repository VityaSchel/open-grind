import { expect, type Page, test } from "@playwright/test";

import { installEventInjection, installTauriShim } from "./support/app";

// The default shim platform is macos, so these pages run the gesture-phase
// bridge; its scroll:gesture events are injected the same way the app would
// receive them from AppKit, while real mouse wheels feed the axis decision.
const CONVERSATION = "/chat/100001:123456000";
const MESSAGE_ROW = '[role="button"][tabindex="0"]';
const INCOMING_ROW = `${MESSAGE_ROW}.pe-3`;
const SCROLLER = '[data-slot="messages-scroller"]';

async function openConversation(page: Page) {
	await installTauriShim(page);
	await installEventInjection(page);
	await page.goto(CONVERSATION);
	await page.locator(MESSAGE_ROW).first().waitFor({ timeout: 60_000 });
	await page.waitForTimeout(400);
}

function emitGesture(
	page: Page,
	payload: { state?: string; dx?: number; dy?: number },
) {
	return page.evaluate((gesture) => {
		window.__emitTauriEvent?.("scroll:gesture", gesture);
	}, payload);
}

async function hoverIncomingMessage(page: Page) {
	const row = page.locator(INCOMING_ROW).last();
	await row.scrollIntoViewIfNeeded();
	const box = await row.boundingBox();
	if (!box) throw new Error("the incoming row has no box");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

test("a bridged drag replies the instant the fingers release", async ({
	page,
}) => {
	await openConversation(page);
	await hoverIncomingMessage(page);
	// A cancelled wheel would pull WebKit off its scrolling fast path, which
	// froze the native overscroll band whenever a gesture touched a message.
	await page.evaluate(() => {
		const w = window as never as { __cancelled: number };
		w.__cancelled = 0;
		addEventListener("wheel", (event) => {
			if (event.defaultPrevented) w.__cancelled++;
		});
	});

	await emitGesture(page, { state: "fingers", dx: 0, dy: 0 });
	// mouse.wheel resolves on input ack, before the DOM event runs; the
	// wheels must all land and lock the axis before any delta may count
	for (let step = 0; step < 3; step++) await page.mouse.wheel(-30, 0);
	await page.waitForTimeout(80);
	for (let step = 0; step < 3; step++)
		await emitGesture(page, { dx: 30, dy: 0 });
	await emitGesture(page, { state: "released" });

	await expect(page.getByLabel("Cancel reply")).toBeVisible();
	expect(
		await page.evaluate(
			() => (window as never as { __cancelled: number }).__cancelled,
		),
	).toBe(0);
});

test("a vertical scroll with sideways drift still scrolls the conversation", async ({
	page,
}) => {
	await openConversation(page);
	await hoverIncomingMessage(page);
	const scroller = page.locator(SCROLLER);
	await scroller.evaluate((el) => {
		el.scrollTop -= 300;
	});
	const from = await scroller.evaluate((el) => el.scrollTop);

	// drift builds sideways travel faster than any single vertical step; a
	// per-axis threshold race locked this to the reply and ate the scroll
	await emitGesture(page, { state: "fingers", dx: 0, dy: 0 });
	for (let step = 0; step < 8; step++) await page.mouse.wheel(-3, 4);
	await emitGesture(page, { state: "released" });

	const travelled = (await scroller.evaluate((el) => el.scrollTop)) - from;
	expect(travelled).toBeGreaterThan(20);
});

test("replying near the floor never conjures the Refresh button", async ({
	page,
}) => {
	await openConversation(page);
	await hoverIncomingMessage(page);

	await emitGesture(page, { state: "fingers", dx: 0, dy: 0 });
	// the reply gesture's wheels carry a few pixels toward the boundary —
	// exactly the crumbs the mouse probe used to misread as a bandless wheel
	for (let step = 0; step < 3; step++) await page.mouse.wheel(-30, 2);
	await page.waitForTimeout(80);
	for (let step = 0; step < 3; step++)
		await emitGesture(page, { dx: 30, dy: -2 });
	await emitGesture(page, { state: "released" });
	await page.getByLabel("Cancel reply").click();

	await page.waitForTimeout(600);
	await expect(page.getByRole("button", { name: "Refresh" })).toHaveCount(0);
});
