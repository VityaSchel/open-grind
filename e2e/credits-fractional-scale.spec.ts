import { expect, type Page, test } from "@playwright/test";

import {
	backLink,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./support/app";
import { STACK_GHOST, STACK_PANE } from "./support/page-stack";
import { pauseOnceSliding, resumeSlides } from "./support/stack-layers";

const DEVICE_PIXEL_RATIO = 2.625;
const WINDOW = { width: 420, height: 800 };
const SCROLLER = '[data-slot="subpage-scroller"]';
const SKIPPED_ROW = "[data-offscreen-skip]";

test.describe.configure({ timeout: 300_000 });

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

async function openCreditsFromAppSettings(page: Page) {
	await installTauriShim(page);
	await page.goto("/settings/app");
	const link = page.getByRole("link", { name: "Credits & Licenses" });
	await link.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await link.click();
	await page
		.getByRole("link", { name: "Suggest an edit" })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

function scrollFrameByFrame({ page, top }: { page: Page; top: number }) {
	return page
		.locator(`${STACK_PANE} ${SCROLLER}`)
		.evaluate(async (scroller, top) => {
			const nextFrame = () => new Promise(requestAnimationFrame);
			while (scroller.scrollTop < top) {
				const before = scroller.scrollTop;
				scroller.scrollTop = Math.min(
					top,
					before + scroller.clientHeight / 2,
				);
				await nextFrame();
				await nextFrame();
				if (scroller.scrollTop <= before) break;
			}
			return scroller.scrollTop;
		}, top);
}

function rowAcrossTheMiddle(page: Page) {
	return page
		.locator(`${STACK_PANE} ${SCROLLER}`)
		.evaluate((scroller, selector) => {
			const { top, height } = scroller.getBoundingClientRect();
			const middle = top + height / 2;
			const rows = [...scroller.querySelectorAll(selector)];
			const index = rows.findIndex((row) => {
				const box = row.getBoundingClientRect();
				return box.top <= middle && box.bottom > middle;
			});
			return { index, top: rows[index]?.getBoundingClientRect().top };
		}, SKIPPED_ROW);
}

function ghostRowTop({ page, index }: { page: Page; index: number }) {
	return page
		.locator(STACK_GHOST)
		.evaluate(
			(ghost, { selector, index }) =>
				ghost.querySelectorAll(selector)[index]?.getBoundingClientRect()
					.top,
			{ selector: SKIPPED_ROW, index },
		);
}

for (const top of [5000, 15000]) {
	test(`Back from credits read down to ${top} px slides off the rows that were on screen`, async ({
		page,
	}) => {
		await openCreditsFromAppSettings(page);
		expect(await scrollFrameByFrame({ page, top })).toBe(top);
		const live = await rowAcrossTheMiddle(page);
		expect(
			live.index,
			"a row crosses the middle of the screen",
		).toBeGreaterThan(0);

		const sliding = pauseOnceSliding(page, { pane: STACK_GHOST });
		await backLink(page).click();
		await sliding;
		const ghostTop = await ghostRowTop({ page, index: live.index });
		await resumeSlides(page);

		expect(ghostTop, "the leaving page still holds that row").toBeDefined();
		expect(
			Math.abs(ghostTop! - live.top!),
			"the leaving page shows that row where it was",
		).toBeLessThanOrEqual(1 / DEVICE_PIXEL_RATIO);
	});
}
