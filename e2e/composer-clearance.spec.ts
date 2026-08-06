import { expect, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";

const MULTILINE_TEXT =
	"one two three four five six seven eight nine ten eleven twelve thirteen " +
	"fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone";

/** px between the newest message and the composer, from pb-[…+--spacing(1.5)] */
const GAP_PX = 6;

const MESSAGE = '[role="button"][tabindex="0"]';

type Metrics = {
	composerHeight: number;
	paddingBottom: number;
	scrollTop: number;
	floorDistance: number;
	newestMessageBottom: number;
	middleMessageTop: number;
	refreshBottom: number;
};

async function openConversation(page: Page) {
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	await page.locator(MESSAGE).first().waitFor({ timeout: 30_000 });
	await page.waitForTimeout(600);
}

function measure(page: Page): Promise<Metrics> {
	return page.evaluate((message) => {
		const scroller = [
			...document.querySelectorAll<HTMLElement>("div"),
		].find(
			(el) =>
				getComputedStyle(el).overflowY === "auto" &&
				el.querySelector(message) !== null,
		);
		if (!scroller) throw new Error("messages scroller not found");
		const form = document.querySelector("form");
		if (!form) throw new Error("composer form not found");
		const messages = [...scroller.querySelectorAll(message)];
		const newest = messages.at(-1);
		const middle = messages[Math.floor(messages.length / 2)];
		if (!newest || !middle) throw new Error("no messages rendered");
		const refresh = scroller.parentElement?.querySelector<HTMLElement>(
			"[data-refresh-phase]",
		);
		return {
			composerHeight: form.clientHeight,
			paddingBottom: parseFloat(getComputedStyle(scroller).paddingBottom),
			scrollTop: scroller.scrollTop,
			floorDistance:
				scroller.scrollHeight -
				scroller.clientHeight -
				scroller.scrollTop,
			newestMessageBottom: newest.getBoundingClientRect().bottom,
			middleMessageTop: middle.getBoundingClientRect().top,
			refreshBottom: refresh
				? parseFloat(getComputedStyle(refresh).bottom)
				: NaN,
		};
	}, MESSAGE);
}

const scrollTo = (page: Page, where: "floor" | "middle") =>
	page.evaluate(
		({ target, message }) => {
			const scroller = [
				...document.querySelectorAll<HTMLElement>("div"),
			].find(
				(el) =>
					getComputedStyle(el).overflowY === "auto" &&
					el.querySelector(message) !== null,
			)!;
			const max = scroller.scrollHeight - scroller.clientHeight;
			scroller.scrollTop = target === "floor" ? max : Math.round(max / 2);
		},
		{ target: where, message: MESSAGE },
	);

test.describe("messages list clears the composer", () => {
	test("bottom padding tracks the composer height", async ({ page }) => {
		await openConversation(page);
		const collapsed = await measure(page);
		expect(collapsed.paddingBottom).toBe(collapsed.composerHeight + GAP_PX);
		expect(collapsed.refreshBottom).toBe(collapsed.composerHeight);

		await page.locator("textarea").fill(MULTILINE_TEXT);
		await expect
			.poll(async () => (await measure(page)).composerHeight)
			.toBeGreaterThan(collapsed.composerHeight);

		const grown = await measure(page);
		expect(grown.paddingBottom).toBe(grown.composerHeight + GAP_PX);
		expect(grown.refreshBottom).toBe(grown.composerHeight);
	});

	test("at the floor, a growing composer pushes messages up", async ({
		page,
	}) => {
		await openConversation(page);
		await scrollTo(page, "floor");
		await page.waitForTimeout(200);
		const before = await measure(page);
		expect(before.floorDistance).toBeLessThanOrEqual(1);

		await page.locator("textarea").fill(MULTILINE_TEXT);
		await expect
			.poll(async () => (await measure(page)).composerHeight)
			.toBeGreaterThan(before.composerHeight);
		const grown = await measure(page);

		const growth = grown.composerHeight - before.composerHeight;
		expect(
			before.newestMessageBottom - grown.newestMessageBottom,
			"messages rise by exactly the composer's growth",
		).toBeCloseTo(growth, 1);
		expect(
			grown.floorDistance,
			"still resting on the floor",
		).toBeLessThanOrEqual(1);

		await page.locator("textarea").fill("");
		await expect
			.poll(async () => (await measure(page)).composerHeight)
			.toBe(before.composerHeight);
		const collapsed = await measure(page);
		expect(collapsed.newestMessageBottom).toBeCloseTo(
			before.newestMessageBottom,
			1,
		);
		expect(collapsed.floorDistance).toBeLessThanOrEqual(1);
	});

	test("scrolled up, a growing composer does not move the view", async ({
		page,
	}) => {
		await openConversation(page);
		await scrollTo(page, "middle");
		await page.waitForTimeout(200);
		const before = await measure(page);
		expect(before.floorDistance).toBeGreaterThan(32);

		await page.locator("textarea").fill(MULTILINE_TEXT);
		await expect
			.poll(async () => (await measure(page)).composerHeight)
			.toBeGreaterThan(before.composerHeight);
		const grown = await measure(page);

		expect(grown.scrollTop, "scroll position untouched").toBeCloseTo(
			before.scrollTop,
			1,
		);
		expect(grown.middleMessageTop, "no visual jump").toBeCloseTo(
			before.middleMessageTop,
			1,
		);
	});
});
