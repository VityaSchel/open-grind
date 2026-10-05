import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	installTauriShim,
	openGrid,
	runPaletteCommand,
} from "./support/app";

const SCROLLER = ".pull-scroller";
const PROFILE_LINK = '[data-slot="grid-cells"] a[href^="/profile/"]';
const SCROLLED_TOP = 1200;
const ELSEWHERE = "ezs42e44yx96";

async function scrolledIntoGrid(page: Page): Promise<Locator> {
	await installTauriShim(page);
	await openGrid(page);
	await page.locator(PROFILE_LINK).first().waitFor({ timeout: 60_000 });
	const scroller = page.locator(SCROLLER);
	await expect
		.poll(() =>
			scroller.evaluate((el) => el.scrollHeight - el.clientHeight),
		)
		.toBeGreaterThan(SCROLLED_TOP);
	await scroller.evaluate((el, top) => el.scrollTo({ top }), SCROLLED_TOP);
	await expect
		.poll(() => scroller.evaluate((el) => el.scrollTop))
		.toBe(SCROLLED_TOP);
	return scroller;
}

async function expectNewResultsFromTheTop({
	page,
	scroller,
	change,
}: {
	page: Page;
	scroller: Locator;
	change: () => Promise<void>;
}): Promise<void> {
	const shownBefore = await page
		.locator(PROFILE_LINK)
		.first()
		.elementHandle();
	if (shownBefore === null) throw new Error("the grid shows no profile");

	await change();

	await expect
		.poll(() => shownBefore.evaluate((link) => link.isConnected))
		.toBe(false);
	await page.locator(PROFILE_LINK).first().waitFor();
	await afterTwoFrames(page);
	expect(
		await scroller.evaluate((el) => el.scrollHeight - el.clientHeight),
	).toBeGreaterThan(SCROLLED_TOP);
	expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
}

test("picking another location shows its grid from the top", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const scroller = await scrolledIntoGrid(page);

	await expectNewResultsFromTheTop({
		page,
		scroller,
		change: () => runPaletteCommand(page, `@${ELSEWHERE}`),
	});
});

test("changing a filter shows the filtered grid from the top", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const scroller = await scrolledIntoGrid(page);

	await expectNewResultsFromTheTop({
		page,
		scroller,
		change: () =>
			page.getByRole("button", { name: "Fresh", exact: true }).click(),
	});
});
