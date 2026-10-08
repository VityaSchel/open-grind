import { expect, test } from "@playwright/test";

import { openGrid } from "./support/app";
import {
	dividers,
	openAllFilters,
	scrollFiltersToBottom,
} from "./support/grid-filters";

const DEVICE_PIXEL_RATIO = 3.5;
const WINDOW = { width: 412, height: 892 };
const INSETS_DEVICE_PX = { top: 145, bottom: 66 };

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

test("the footer divider hides at the bottom of a sheet with a fractional height", async ({
	page,
}) => {
	await openGrid(page);
	await page.evaluate(
		({ top, bottom }) => {
			const insets = window.__AndroidInsets;
			if (!insets) throw new Error("Test insets are off");
			insets.top = () => top;
			insets.bottom = () => bottom;
			window.__reapplyInsets();
		},
		{
			top: INSETS_DEVICE_PX.top / DEVICE_PIXEL_RATIO,
			bottom: INSETS_DEVICE_PX.bottom / DEVICE_PIXEL_RATIO,
		},
	);
	await openAllFilters(page);

	await scrollFiltersToBottom(page);

	await expect
		.poll(() => dividers(page))
		.toEqual({ header: true, footer: false });
});
