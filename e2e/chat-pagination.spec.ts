import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const LONG_CONVERSATION = "/chat/100333:123456000";
const NEWEST_MESSAGE = "Backlog message 80";
const OLDEST_MESSAGE = "Backlog message 1";
const SCROLLER = '[data-slot="messages-scroller"]';

test("scrolling to the top loads older pages until the thread starts", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await installTauriShim(page);
	await page.goto(LONG_CONVERSATION);

	await page
		.getByText(NEWEST_MESSAGE, { exact: true })
		.waitFor({ timeout: 60_000 });
	await expect(page.getByText(OLDEST_MESSAGE, { exact: true })).toHaveCount(
		0,
	);

	const scroller = page.locator(SCROLLER);
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
