import { expect, type Locator, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const LONG_CONVERSATION = "/chat/100333:123456000";
const NEWEST_MESSAGE = "Backlog message 80";
const OLDEST_MESSAGE = "Backlog message 1";
const SCROLLER = '[data-slot="messages-scroller"]';
const MESSAGE = '[data-slot="message"]';

type AnchorProbe = { anchorDrifts: number[]; sampleAnchor: () => void };

async function openLongConversation(page: Page): Promise<Locator> {
	await installTauriShim(page);
	await page.goto(LONG_CONVERSATION);
	await page
		.getByText(NEWEST_MESSAGE, { exact: true })
		.filter({ visible: true })
		.waitFor({ timeout: 60_000 });
	return page.locator(SCROLLER);
}

async function waitForPagingToSettle(page: Page): Promise<number> {
	let previous = -1;
	await expect
		.poll(
			async () => {
				const count = await page.locator(MESSAGE).count();
				const settled = count === previous;
				previous = count;
				return settled;
			},
			{ timeout: 30_000, intervals: [500] },
		)
		.toBe(true);
	return previous;
}

test("scrolling to the top loads older pages until the thread starts", async ({
	page,
}) => {
	test.setTimeout(120_000);
	const scroller = await openLongConversation(page);
	await expect(page.getByText(OLDEST_MESSAGE, { exact: true })).toHaveCount(
		0,
	);

	await expect
		.poll(
			async () => {
				await scroller.evaluate((element) => {
					element.scrollTop = 0;
				});
				return page.getByText(OLDEST_MESSAGE, { exact: true }).count();
			},
			{ timeout: 60_000, intervals: [200] },
		)
		.toBe(1);
});

test("an older page lands without moving the messages in view", async ({
	page,
}) => {
	test.setTimeout(120_000);
	const scroller = await openLongConversation(page);
	const loaded = await waitForPagingToSettle(page);

	await scroller.evaluate((element) => {
		element.scrollTop = 300;
		const viewTop = element.getBoundingClientRect().top;
		const anchor = Array.from(
			element.querySelectorAll<HTMLElement>('[data-slot="message"]'),
		).find((message) => message.getBoundingClientRect().bottom > viewTop);
		if (!anchor) throw new Error("No message in view");
		const anchorTop = anchor.getBoundingClientRect().top;
		const drifts: number[] = [];
		const sample = () =>
			drifts.push(anchor.getBoundingClientRect().top - anchorTop);
		new MutationObserver(sample).observe(element, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: true,
		});
		element.addEventListener("scroll", sample);
		Object.assign(window, { anchorDrifts: drifts, sampleAnchor: sample });
	});

	await expect
		.poll(() => page.locator(MESSAGE).count(), { timeout: 30_000 })
		.toBeGreaterThan(loaded);
	await waitForPagingToSettle(page);

	const drifts = await page.evaluate(() => {
		const probe = window as unknown as AnchorProbe;
		probe.sampleAnchor();
		return probe.anchorDrifts;
	});
	expect(Math.max(...drifts.map(Math.abs))).toBeLessThanOrEqual(1);
});

test("a window taller than the thread shows all of it without being scrolled", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 420, height: 8000 });
	await openLongConversation(page);

	await expect(page.getByText(OLDEST_MESSAGE, { exact: true })).toHaveCount(
		1,
		{ timeout: 30_000 },
	);
});

test("the start of the thread stays put when paging runs out", async ({
	page,
}) => {
	test.setTimeout(120_000);
	const scroller = await openLongConversation(page);
	await scroller.evaluate((element, oldest) => {
		const exactly = new RegExp(`^${oldest}(?!\\d)`);
		const offsets: number[] = [];
		const sample = () => {
			const message = Array.from(
				element.querySelectorAll<HTMLElement>('[data-slot="message"]'),
			).find((candidate) => exactly.test(candidate.innerText.trim()));
			if (!message) return;
			offsets.push(
				message.getBoundingClientRect().top -
					element.getBoundingClientRect().top +
					element.scrollTop,
			);
		};
		new MutationObserver(sample).observe(element, {
			subtree: true,
			childList: true,
			attributes: true,
		});
		Object.assign(window, { oldestOffsets: offsets });
	}, OLDEST_MESSAGE);

	await expect
		.poll(
			async () => {
				await scroller.evaluate((element) => {
					element.scrollTop = 0;
				});
				return page.getByText(OLDEST_MESSAGE, { exact: true }).count();
			},
			{ timeout: 60_000, intervals: [200] },
		)
		.toBe(1);
	let samples = 0;
	await expect
		.poll(
			async () => {
				await scroller.evaluate((element) => {
					element.scrollTop = 0;
				});
				const count = await page.evaluate(
					() =>
						(window as unknown as { oldestOffsets: number[] })
							.oldestOffsets.length,
				);
				const settled = count > 1 && count === samples;
				samples = count;
				return settled;
			},
			{ timeout: 30_000, intervals: [500] },
		)
		.toBe(true);

	const offsets = await page.evaluate(
		() => (window as unknown as { oldestOffsets: number[] }).oldestOffsets,
	);
	expect(offsets.length).toBeGreaterThan(1);
	expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThanOrEqual(1);
});
