import { expect, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	DEMO_CONVERSATION,
	installTauriShim,
} from "./support/app";

const MESSAGE = '[data-slot="message"]';
const SCROLLER = '[data-slot="messages-scroller"]';
const COMPOSER = '[data-slot="message-composer"]';

type Keyboard = {
	viewport: { width: number; height: number };
	insets: {
		top: number;
		bottom: number;
		left: number;
		right: number;
		ime: boolean;
	};
};

const KEYBOARD_CLOSED: Keyboard = {
	viewport: { width: 420, height: 900 },
	insets: { top: 64, bottom: 64, left: 0, right: 0, ime: false },
};
const KEYBOARD_OPEN: Keyboard = {
	viewport: { width: 420, height: 560 },
	insets: { top: 64, bottom: 0, left: 0, right: 0, ime: true },
};

type View = {
	scrollTop: number;
	floorDistance: number;
	newestBottom: number;
	composerTop: number;
};

function readView(page: Page): Promise<View> {
	return page.evaluate(
		({ message, scroller, composer }) => {
			const list = document.querySelector<HTMLElement>(scroller)!;
			const newest = [...list.querySelectorAll(message)].at(-1)!;
			return {
				scrollTop: list.scrollTop,
				floorDistance:
					list.scrollHeight - list.clientHeight - list.scrollTop,
				newestBottom: newest.getBoundingClientRect().bottom,
				composerTop: document
					.querySelector(composer)!
					.getBoundingClientRect().top,
			};
		},
		{ message: MESSAGE, scroller: SCROLLER, composer: COMPOSER },
	);
}

async function openConversation(page: Page): Promise<void> {
	await page.setViewportSize(KEYBOARD_CLOSED.viewport);
	await installTauriShim(page, { platform: "android" });
	await page.goto(DEMO_CONVERSATION);
	await page.locator(MESSAGE).first().waitFor({ timeout: 60_000 });
	await page.waitForFunction((scroller) => {
		const images = document
			.querySelector(scroller)
			?.querySelectorAll("img");
		return images !== undefined && [...images].every((img) => img.complete);
	}, SCROLLER);
	await page.waitForTimeout(500);
}

function sendInsets(page: Page, insets: Keyboard["insets"]): Promise<unknown> {
	return page.evaluate((next) => window.__reapplyInsets(next), insets);
}

async function switchKeyboardAtOnce(
	page: Page,
	{ viewport, insets }: Keyboard,
): Promise<void> {
	await sendInsets(page, insets);
	await page.setViewportSize(viewport);
}

async function scrollAboveNewest(page: Page, distance: number): Promise<void> {
	await page.evaluate(
		({ scroller, distance }) => {
			const list = document.querySelector<HTMLElement>(scroller)!;
			list.scrollTop = list.scrollHeight - list.clientHeight - distance;
		},
		{ scroller: SCROLLER, distance },
	);
	await page.waitForTimeout(300);
	expect((await readView(page)).floorDistance).toBeCloseTo(distance, 0);
}

async function scrollListTo(page: Page, scrollTop: number): Promise<void> {
	await page.evaluate(
		({ scroller, scrollTop }) => {
			document.querySelector(scroller)!.scrollTop = scrollTop;
		},
		{ scroller: SCROLLER, scrollTop },
	);
	await page.waitForTimeout(300);
}

async function settledView(page: Page): Promise<View> {
	await page.waitForTimeout(400);
	return readView(page);
}

function expectNewestVisible(view: View): void {
	expect(
		view.newestBottom,
		"the newest message should clear the composer",
	).toBeLessThanOrEqual(view.composerTop + 0.5);
}

const keyboardOrders = [
	{
		when: "the insets land with the resize",
		switchKeyboard: switchKeyboardAtOnce,
	},
	{
		when: "the insets land after the resize",
		switchKeyboard: async (page: Page, { viewport, insets }: Keyboard) => {
			await page.setViewportSize(viewport);
			await afterTwoFrames(page);
			await sendInsets(page, insets);
		},
	},
	{
		when: "the insets land before the resize",
		switchKeyboard: async (page: Page, { viewport, insets }: Keyboard) => {
			await sendInsets(page, insets);
			await page.waitForTimeout(250);
			await page.setViewportSize(viewport);
		},
	},
];

for (const { when, switchKeyboard } of keyboardOrders) {
	test(`the newest message stays in view as the keyboard opens and closes when ${when}`, async ({
		page,
	}) => {
		await openConversation(page);
		const before = await readView(page);

		await switchKeyboard(page, KEYBOARD_OPEN);
		const open = await settledView(page);
		expect(open.floorDistance).toBeLessThanOrEqual(
			before.floorDistance + 0.5,
		);
		expectNewestVisible(open);

		await switchKeyboard(page, KEYBOARD_CLOSED);
		const closed = await settledView(page);
		expect(closed.floorDistance).toBeLessThanOrEqual(
			before.floorDistance + 0.5,
		);
		expectNewestVisible(closed);
		await expect(
			page.getByRole("button", { name: "Scroll to newest messages" }),
		).toHaveCount(0);
	});
}

for (const delay of [40, 80]) {
	test(`replying keeps the newest message in view when the keyboard opens ${delay} ms later`, async ({
		page,
	}) => {
		await openConversation(page);
		const before = await readView(page);

		await page
			.locator(`${MESSAGE} [role="article"]`)
			.last()
			.click({ button: "right" });
		await page.getByRole("button", { name: "Reply" }).click();
		await page.waitForTimeout(delay);
		await switchKeyboardAtOnce(page, KEYBOARD_OPEN);

		const open = await settledView(page);
		expect(open.floorDistance).toBeLessThanOrEqual(
			before.floorDistance + 0.5,
		);
		expectNewestVisible(open);
	});
}

test("a window resize without a keyboard keeps the newest message in view", async ({
	page,
}) => {
	await openConversation(page);
	const before = await readView(page);

	await page.setViewportSize({ width: 420, height: 600 });
	const shorter = await settledView(page);
	expect(shorter.floorDistance).toBeLessThanOrEqual(
		before.floorDistance + 0.5,
	);
	expectNewestVisible(shorter);

	await page.setViewportSize({ width: 380, height: 900 });
	const narrower = await settledView(page);
	expect(narrower.floorDistance).toBeLessThanOrEqual(
		before.floorDistance + 0.5,
	);
});

test("a keyboard opening during the glide to the newest message still ends on it", async ({
	page,
}) => {
	await openConversation(page);
	await scrollAboveNewest(page, 300);

	await page
		.getByRole("button", { name: "Scroll to newest messages" })
		.click();
	await page.waitForTimeout(60);
	await switchKeyboardAtOnce(page, KEYBOARD_OPEN);
	await page.waitForTimeout(1500);

	const open = await readView(page);
	expect(open.floorDistance).toBeLessThanOrEqual(1);
	expectNewestVisible(open);
});

for (const { when, switchKeyboard } of keyboardOrders) {
	test(`scrolled up, the keyboard keeps the bottom of the screen in view when ${when}`, async ({
		page,
	}) => {
		await openConversation(page);
		await scrollAboveNewest(page, 300);

		await switchKeyboard(page, KEYBOARD_OPEN);
		expect(
			Math.abs((await settledView(page)).floorDistance - 300),
		).toBeLessThanOrEqual(1);

		await switchKeyboard(page, KEYBOARD_CLOSED);
		expect(
			Math.abs((await settledView(page)).floorDistance - 300),
		).toBeLessThanOrEqual(1);
		await expect(
			page.getByRole("button", { name: "Scroll to newest messages" }),
		).toBeVisible();
	});
}

test("scrolled up, returning to where a closing keyboard left the view still counts as the reader's place", async ({
	page,
}) => {
	await openConversation(page);
	await switchKeyboardAtOnce(page, KEYBOARD_OPEN);
	await settledView(page);
	await scrollListTo(page, 40);
	await switchKeyboardAtOnce(page, KEYBOARD_CLOSED);
	await settledView(page);
	for (const scrollTop of [100, 30, 0]) await scrollListTo(page, scrollTop);
	const before = await readView(page);

	await switchKeyboardAtOnce(page, KEYBOARD_OPEN);

	expect(
		Math.abs(
			(await settledView(page)).floorDistance - before.floorDistance,
		),
	).toBeLessThanOrEqual(1);
});
