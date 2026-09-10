import { expect, type Page, test } from "@playwright/test";

import { ensureGridLocation, flownIn, installTauriShim } from "./support/app";

const BUTTON = '[aria-label="Scroll to top"]';
const NAVBAR_PILL = "nav .links";
const PROFILE_LINK = 'a[href^="/profile/"]';
const CONVERSATIONS_SCROLLER = '[data-slot="conversations-scroller"]';
const GAP_ABOVE_NAVBAR_PX = 12;
const TOP_SLOP_PX = 16;

type Surface = {
	name: string;
	path: string;
	scroller: string;
	content: string;
	prepare?: (page: Page) => Promise<void>;
};

const SURFACES: Surface[] = [
	{
		name: "the browse grid",
		path: "/",
		scroller: ".pull-scroller",
		content: PROFILE_LINK,
		prepare: ensureGridLocation,
	},
	{
		name: "the taps list",
		path: "/interest/taps",
		scroller: ".pull-scroller",
		content: PROFILE_LINK,
	},
	{
		name: "the views grid",
		path: "/interest/views",
		scroller: ".pull-scroller",
		content: PROFILE_LINK,
	},
	{
		name: "the inbox",
		path: "/chat",
		scroller: CONVERSATIONS_SCROLLER,
		content: 'a[href^="/chat/"]',
	},
	{
		name: "the blocked list",
		path: "/settings/account/blocked",
		scroller: '[data-slot="settings-scroller"]',
		content: '[role="switch"]',
	},
];

async function open(page: Page, surface: Surface) {
	if (surface.prepare) test.setTimeout(180_000);
	await installTauriShim(page);
	await page.goto(surface.path);
	await page.locator("nav a").first().waitFor({ timeout: 60_000 });
	await surface.prepare?.(page);
	await page.locator(surface.content).first().waitFor({ timeout: 60_000 });
}

async function scrollToEnd(page: Page, selector: string) {
	const scroller = page.locator(selector).first();
	await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
	await expect
		.poll(() => scroller.evaluate((el) => el.scrollTop), {
			message: "the surface holds too little content to scroll",
		})
		.toBeGreaterThan(TOP_SLOP_PX);
	return scroller;
}

function geometry(page: Page, scroller: string) {
	return page.evaluate(
		({ button, pill, scroller }) => {
			const glass = document.querySelector(button)?.parentElement;
			const bar = document.querySelector(pill);
			const list = document.querySelector(scroller);
			if (!glass || !bar || !list)
				throw new Error("scroll-to-top button, navbar or list missing");
			const control = glass.getBoundingClientRect();
			const listRect = list.getBoundingClientRect();
			return {
				gapAboveNavBar:
					bar.getBoundingClientRect().top - control.bottom,
				offCenter:
					control.left +
					control.width / 2 -
					(listRect.left + listRect.width / 2),
				listWidth: listRect.width,
			};
		},
		{ button: BUTTON, pill: NAVBAR_PILL, scroller },
	);
}

for (const surface of SURFACES) {
	test(`${surface.name} offers a scroll-to-top button that clears the navbar`, async ({
		page,
	}) => {
		await open(page, surface);
		await expect(page.locator(BUTTON)).toHaveCount(0);

		const scroller = await scrollToEnd(page, surface.scroller);
		await expect(page.locator(BUTTON)).toBeVisible();
		await flownIn(page, BUTTON);

		const { gapAboveNavBar, offCenter } = await geometry(
			page,
			surface.scroller,
		);
		expect(gapAboveNavBar).toBeCloseTo(GAP_ABOVE_NAVBAR_PX, 0);
		expect(Math.abs(offCenter)).toBeLessThanOrEqual(1);

		await page.locator(BUTTON).click();
		await expect
			.poll(() => scroller.evaluate((el) => el.scrollTop))
			.toBe(0);
		await expect(page.locator(BUTTON)).toHaveCount(0);
	});
}

test.describe("side by side with a conversation", () => {
	test.use({ viewport: { width: 1100, height: 800 } });

	test("the inbox button centers on the conversation list, not the window", async ({
		page,
	}) => {
		await installTauriShim(page);
		await page.goto("/chat");
		await page
			.locator("a[href^='/chat/']")
			.first()
			.waitFor({ timeout: 60_000 });

		await scrollToEnd(page, CONVERSATIONS_SCROLLER);
		await expect(page.locator(BUTTON)).toBeVisible();
		await flownIn(page, BUTTON);

		const { gapAboveNavBar, offCenter, listWidth } = await geometry(
			page,
			CONVERSATIONS_SCROLLER,
		);
		expect(listWidth).toBeLessThan(900);
		expect(gapAboveNavBar).toBeCloseTo(GAP_ABOVE_NAVBAR_PX, 0);
		expect(Math.abs(offCenter)).toBeLessThanOrEqual(1);
	});
});

test("a list that fits on screen never offers the button", async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/settings/account/hidden");
	await expect(page.getByText("No Hidden Users")).toBeVisible({
		timeout: 60_000,
	});

	const overflow = await page
		.locator('[data-slot="settings-scroller"]')
		.evaluate((el) => el.scrollHeight - el.clientHeight);
	expect(overflow).toBeLessThanOrEqual(TOP_SLOP_PX);
	await expect(page.locator(BUTTON)).toHaveCount(0);
});
