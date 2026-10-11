import { test } from "@playwright/test";

import { expectPhotosToRestWithoutNeighbors } from "./support/carousel-seam";

const DEVICE_PIXEL_RATIO = 2.625;
const WINDOW = { width: 412, height: 800 };

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

test("every profile photo rests without a device row of its neighbors on a phone", async ({
	page,
}) => {
	await expectPhotosToRestWithoutNeighbors(page, {
		devicePixelRatio: DEVICE_PIXEL_RATIO,
	});
});
