import { expect, test } from "@playwright/test";

import { openGrid } from "./support/app";
import {
	dividers,
	openAllFilters,
	scrollFiltersToBottom,
} from "./support/grid-filters";
import { introSizes } from "./support/transitions";

const DEVICE_PIXEL_RATIO = 3.5;
const WINDOW = { width: 412, height: 892 };
const INSETS_DEVICE_PX = { top: 145, bottom: 66 };
const GENDER_FILTER = '[data-slot="gender-filter"]';
const MAX_CHIP_SNAP_PX = 0.02;

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

test("revealed gender chips grow to their resting width without a snap at the end", async ({
	page,
}) => {
	await openGrid(page);
	await openAllFilters(page);
	const genderFilter = page.locator(`[role="dialog"] ${GENDER_FILTER}`);
	await genderFilter
		.locator('[data-slot="toggle-group-item"]')
		.first()
		.waitFor();

	const sizes = introSizes({ page, within: GENDER_FILTER });
	await genderFilter.getByRole("button", { name: "More" }).click();
	const { atEnd, settled } = await sizes;

	expect(atEnd).toHaveLength(3);
	const snaps = atEnd.map(({ width }, index) =>
		Math.abs(width - (settled[index]?.width ?? NaN)),
	);
	expect(Math.max(...snaps)).toBeLessThan(MAX_CHIP_SNAP_PX);
});
