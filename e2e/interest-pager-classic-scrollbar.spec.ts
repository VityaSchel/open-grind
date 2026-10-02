import { expect, test } from "@playwright/test";

import { afterTwoFrames, CLASSIC_SCROLLBARS } from "./support/app";
import {
	LIST_SCROLLERS,
	listScrollbars,
	openTaps,
	PAGER,
	swipeAcross,
	TAPS_PANE,
} from "./support/interest-pager";

const SCROLLBAR_PX = 15;

test.describe.configure({ timeout: 300_000 });

test.use(CLASSIC_SCROLLBARS);

test("lists whose scrollbar takes room beside them keep it, and their width, while a finger holds the pager between tabs", async ({
	page,
}) => {
	await openTaps(page);
	await page.addStyleTag({
		content: `:is(${LIST_SCROLLERS.join()})::-webkit-scrollbar { width: ${SCROLLBAR_PX}px; }`,
	});
	const width = await page.locator(PAGER).evaluate((el) => el.clientWidth);
	const narrowed = {
		scrollbarWidth: "auto",
		contentWidth: width - SCROLLBAR_PX,
	};
	expect(await listScrollbars(page)).toEqual([null, narrowed]);

	const touch = await swipeAcross(page, {
		distancePx: Math.round(width * 0.65),
		release: false,
	});
	await expect(page.locator(TAPS_PANE)).toHaveAttribute("inert", "");
	await afterTwoFrames(page);

	expect(await listScrollbars(page)).toEqual([narrowed, narrowed]);
	await touch.end();
});
