import { expect, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";

const MESSAGE = '[role="button"][tabindex="0"]';
const SCROLLER = '[data-slot="messages-scroller"]';
const REPLIABLE = "consectetur adipiscing elit";
const LONG_DRAFT =
	"one two three four five six seven eight nine ten eleven twelve thirteen " +
	"fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone";

// The list counts as resting on the floor anywhere within FLOOR_SLOP_PX of it,
// and a dragged scroll routinely stops inside that band rather than on the floor.
const INSIDE_THE_SLOP_PX = 12;

type View = {
	composerHeight: number;
	scrollTop: number;
	floorDistance: number;
	newestMessageBottom: number;
};

function readView(page: Page): Promise<View> {
	return page.evaluate(
		({ message, scroller }) => {
			const list = document.querySelector<HTMLElement>(scroller);
			if (!list) throw new Error("messages scroller not found");
			const form = document.querySelector("form");
			if (!form) throw new Error("composer form not found");
			const newest = [...list.querySelectorAll(message)].at(-1);
			if (!newest) throw new Error("no messages rendered");
			return {
				composerHeight: form.clientHeight,
				scrollTop: list.scrollTop,
				floorDistance:
					list.scrollHeight - list.clientHeight - list.scrollTop,
				newestMessageBottom: newest.getBoundingClientRect().bottom,
			};
		},
		{ message: MESSAGE, scroller: SCROLLER },
	);
}

async function openConversation(page: Page) {
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	await page.locator(MESSAGE).first().waitFor({ timeout: 30_000 });
	await page.waitForFunction(
		(scroller) =>
			[
				...document
					.querySelector<HTMLElement>(scroller)!
					.querySelectorAll("img"),
			].every((img) => img.complete),
		SCROLLER,
	);
	await page.waitForTimeout(500);
}

async function restAbove(page: Page, above: number) {
	await page.evaluate(
		({ scroller, above }) => {
			const list = document.querySelector<HTMLElement>(scroller)!;
			list.scrollTop = list.scrollHeight - list.clientHeight - above;
		},
		{ scroller: SCROLLER, above },
	);
	await page.waitForTimeout(300);
	const resting = await readView(page);
	expect(
		resting.floorDistance,
		"the list starts where the test asked it to",
	).toBeCloseTo(above, 1);
	return resting;
}

async function settleComposer(
	page: Page,
	settled: (height: number) => boolean,
) {
	await expect
		.poll(async () => settled((await readView(page)).composerHeight))
		.toBe(true);
	await page.waitForTimeout(300);
	return readView(page);
}

type Grower = {
	what: string;
	grow: (page: Page) => Promise<void>;
	shrink: (page: Page) => Promise<void>;
};

const growers: Grower[] = [
	{
		what: "arming a reply",
		grow: async (page) => {
			// dispatched rather than clicked: a real click lets playwright
			// scroll the row into view, moving what is being measured
			await page
				.locator(MESSAGE)
				.filter({ hasText: REPLIABLE })
				.dispatchEvent("contextmenu");
			await page.getByRole("button", { name: "Reply" }).click();
			await page.getByLabel("Cancel reply").waitFor();
		},
		shrink: async (page) => {
			await page.getByLabel("Cancel reply").click();
			await page
				.getByLabel("Cancel reply")
				.waitFor({ state: "detached" });
		},
	},
	{
		what: "typing a draft that wraps",
		grow: (page) => page.locator("textarea").fill(LONG_DRAFT),
		shrink: (page) => page.locator("textarea").fill(""),
	},
];

test.describe("a composer resize is undone exactly when it is reversed", () => {
	for (const grower of growers) {
		for (const above of [0, INSIDE_THE_SLOP_PX]) {
			test(`${grower.what}, resting ${above}px above the floor`, async ({
				page,
			}) => {
				await openConversation(page);
				const before = await restAbove(page, above);

				await grower.grow(page);
				const grown = await settleComposer(
					page,
					(height) => height > before.composerHeight,
				);

				const growth = grown.composerHeight - before.composerHeight;
				expect(
					before.newestMessageBottom - grown.newestMessageBottom,
					"the list rises by exactly the composer's growth",
				).toBeCloseTo(growth, 1);

				await grower.shrink(page);
				const after = await settleComposer(
					page,
					(height) => height === before.composerHeight,
				);

				expect(
					after.newestMessageBottom,
					"the list ends where it started",
				).toBeCloseTo(before.newestMessageBottom, 1);
				expect(
					after.scrollTop,
					"the scroll ends where it started",
				).toBeCloseTo(before.scrollTop, 1);
			});
		}
	}

	test("scrolled up, arming a reply moves nothing", async ({ page }) => {
		await openConversation(page);
		const before = await restAbove(page, 120);

		await growers[0]!.grow(page);
		const grown = await settleComposer(
			page,
			(height) => height > before.composerHeight,
		);
		expect(grown.scrollTop, "scroll position untouched").toBeCloseTo(
			before.scrollTop,
			1,
		);
		expect(grown.newestMessageBottom, "no visual jump").toBeCloseTo(
			before.newestMessageBottom,
			1,
		);

		await growers[0]!.shrink(page);
		const after = await settleComposer(
			page,
			(height) => height === before.composerHeight,
		);
		expect(after.scrollTop).toBeCloseTo(before.scrollTop, 1);
		expect(after.newestMessageBottom).toBeCloseTo(
			before.newestMessageBottom,
			1,
		);
	});

	// the settle-position cases above cannot see a mid-animation lurch, which is
	// the whole risk of animating a box the scroller's padding is derived from
	test("the view holds still while the reply bar animates", async ({
		page,
	}) => {
		await openConversation(page);
		const sample = async () => {
			const seen: number[] = [];
			const heights: number[] = [];
			for (let frame = 0; frame < 14; frame++) {
				const view = await readView(page);
				seen.push(view.newestMessageBottom);
				heights.push(view.composerHeight);
				await page.waitForTimeout(15);
			}
			const steps = seen
				.slice(1)
				.map((value, index) => Math.abs(value - seen[index]!));
			return {
				travelled: Math.max(...seen) - Math.min(...seen),
				biggestStep: Math.max(...steps),
				animated: Math.max(...heights) - Math.min(...heights),
			};
		};

		await page
			.locator(MESSAGE)
			.filter({ hasText: REPLIABLE })
			.dispatchEvent("contextmenu");
		await page.getByRole("button", { name: "Reply" }).click();
		const opening = await sample();
		expect(opening.animated, "the bar really animates").toBeGreaterThan(8);
		expect(
			opening.biggestStep,
			"the list eases up rather than lurching",
		).toBeLessThan(opening.travelled);

		await page.getByLabel("Cancel reply").click();
		const closing = await sample();
		expect(closing.animated, "the bar really animates").toBeGreaterThan(8);
		expect(
			closing.biggestStep,
			"the list eases down rather than lurching",
		).toBeLessThan(closing.travelled);
	});
});
