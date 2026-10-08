import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	MESSAGE_ROW,
	TrustedTouch,
	wheel,
} from "./support/app";
import { BUTTON_ROW_PX, refreshButton } from "./support/pull";

const DEVICE_PIXEL_RATIO = 1.25;
const WINDOW = { width: 416, height: 802 };
const WINDOW_WIDTHS_TO_TRY = Array.from(
	{ length: 16 },
	(_, step) => WINDOW.width + step * 2,
);
const WINDOW_HEIGHTS_TO_TRY = Array.from(
	{ length: 8 },
	(_, step) => WINDOW.height + step,
);
const MESSAGES_SCROLLER = '[data-slot="messages-scroller"]';
const ROOM_ABOVE_COMPOSER_PROPERTY = "--refresh-inset-bottom";

test.use({
	viewport: null,
	deviceScaleFactor: ({ contextOptions }, use) =>
		use(contextOptions.deviceScaleFactor),
	launchOptions: ({ launchOptions }, use) =>
		use({
			...launchOptions,
			args: [
				...(launchOptions.args ?? []),
				`--force-device-scale-factor=${DEVICE_PIXEL_RATIO}`,
				`--window-size=${WINDOW.width},${WINDOW.height}`,
			],
		}),
});

async function openConversation(page: Page): Promise<void> {
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	await page
		.locator(MESSAGE_ROW)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await page
		.locator(`${MESSAGES_SCROLLER} ~ [data-refresh-phase]`)
		.waitFor({ state: "attached" });
	await page.waitForTimeout(600);
}

function scrollToTheTrueFloor(scroller: Locator): Promise<number> {
	return scroller.evaluate(async (el) => {
		el.scrollTop = el.scrollHeight;
		await new Promise((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(resolve)),
		);
		return el.scrollHeight - el.clientHeight - el.scrollTop;
	});
}

async function findAFloorAWholePixelBelowItsRange(page: Page): Promise<void> {
	const scroller = page.locator(MESSAGES_SCROLLER);
	const cdp = await page.context().newCDPSession(page);
	const { windowId } = await cdp.send("Browser.getWindowForTarget");
	for (const width of WINDOW_WIDTHS_TO_TRY) {
		for (const height of WINDOW_HEIGHTS_TO_TRY) {
			await cdp.send("Browser.setWindowBounds", {
				windowId,
				bounds: { width, height },
			});
			await afterTwoFrames(page);
			if ((await scrollToTheTrueFloor(scroller)) >= 1) {
				await cdp.detach();
				return;
			}
		}
	}
	throw new Error(
		"no window size left the conversation's floor a whole pixel below scrollHeight - clientHeight",
	);
}

const bottomOf = (row: Locator) =>
	row.evaluate((el) => el.getBoundingClientRect().bottom);

const roomAboveComposer = (scroller: Locator) =>
	scroller.evaluate(
		(el: HTMLElement, room) => el.style.getPropertyValue(room),
		ROOM_ABOVE_COMPOSER_PROPERTY,
	);

test.describe("the newest message of a conversation at a fractional device pixel ratio", () => {
	test("a mouse wheel there offers the Refresh button in a room of its own", async ({
		page,
	}) => {
		await openConversation(page);
		await findAFloorAWholePixelBelowItsRange(page);
		const scroller = page.locator(MESSAGES_SCROLLER);
		const newest = page.locator(MESSAGE_ROW).last();
		const restingBottom = await bottomOf(newest);
		const box = await newest.boundingBox();
		if (!box) throw new Error("the newest message is not on screen");

		await wheel(
			page,
			{ x: box.x + box.width / 2, y: box.y + box.height / 2 },
			100,
		);

		await expect(refreshButton(page)).toBeVisible();
		await expect
			.poll(() => roomAboveComposer(scroller))
			.toBe(`${BUTTON_ROW_PX}px`);
		await expect
			.poll(async () =>
				Math.abs(
					(await bottomOf(newest)) - (restingBottom - BUTTON_ROW_PX),
				),
			)
			.toBeLessThanOrEqual(1 / DEVICE_PIXEL_RATIO);
		await expect(refreshButton(page)).toBeVisible();
	});

	test("a touch pull there refreshes it", async ({ page }) => {
		await openConversation(page);
		await findAFloorAWholePixelBelowItsRange(page);
		const scroller = page.locator(MESSAGES_SCROLLER);
		const phases = await page
			.locator(`${MESSAGES_SCROLLER} ~ [data-refresh-phase]`)
			.evaluateHandle((control: HTMLElement) => {
				const seen = new Set<string | undefined>();
				const sample = () => {
					seen.add(control.dataset.refreshPhase);
					requestAnimationFrame(sample);
				};
				requestAnimationFrame(sample);
				return seen;
			});
		const box = await scroller.boundingBox();
		if (!box) throw new Error("the conversation has no box");
		const x = box.x + box.width / 2;

		const touch = await TrustedTouch.attach(page);
		await touch.drag(
			page,
			{ x, y: box.y + box.height * 0.6 },
			{ x, y: box.y + box.height * 0.2 },
			{ steps: 24, holdMs: 16 },
		);

		await expect
			.poll(() => phases.evaluate((seen) => [...seen]))
			.toContain("refreshing");
	});
});
