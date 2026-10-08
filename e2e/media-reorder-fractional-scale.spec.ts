import { test } from "@playwright/test";

import { openAlbum, TWO_ROW_ALBUM } from "./support/albums";
import { expectPreviewOnDevicePixels } from "./support/media-reorder";

const DEVICE_PIXEL_RATIO = 2.8125;
const WINDOW = { width: 384, height: 800 };

test.describe.configure({ timeout: 180_000 });

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

test("photos pushed aside by a held one sit on whole device pixels", async ({
	page,
}) => {
	await openAlbum(page, TWO_ROW_ALBUM);
	await expectPreviewOnDevicePixels({ page, from: 0, to: 4 });
});
