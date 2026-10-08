import { expect, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";
import { AVATAR_HOST, serveImages } from "./support/media";

const DEVICE_PIXEL_RATIO = 1.75;
const WINDOW = { width: 401, height: 800 };
const FOUR_PHOTO_PROFILE = "/profile/100004";
const CAROUSEL_ITEM = ".carousel .item[href]";
const LIGHTBOX = ".pswp";
const ACTIVE_SLIDE_IMAGE = `.pswp__item:not([aria-hidden="true"]) .pswp__img:not(.pswp__img--placeholder)`;

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

test("a width-fit photo reaches the right edge of a fractional-width lightbox", async ({
	page,
}) => {
	await serveImages(page, AVATAR_HOST);
	await installTauriShim(page);
	await page.goto(FOUR_PHOTO_PROFILE);
	const firstPhoto = page.locator(CAROUSEL_ITEM).first();
	await firstPhoto.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await firstPhoto.click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as { pswp?: { opener: { isOpen: boolean } } }).pswp
						?.opener.isOpen === true,
			),
		)
		.toBe(true);

	const edgesOf = () =>
		page.evaluate(
			({ lightbox, image }) => {
				const root = document.querySelector(lightbox);
				const photo = document.querySelector(image);
				if (
					root === null ||
					!(photo instanceof HTMLImageElement) ||
					photo.naturalWidth === 0
				)
					return null;
				return {
					root: root.getBoundingClientRect().right,
					photo: photo.getBoundingClientRect().right,
				};
			},
			{ lightbox: LIGHTBOX, image: ACTIVE_SLIDE_IMAGE },
		);
	await expect
		.poll(edgesOf, { message: "the lightbox shows the loaded photo" })
		.not.toBeNull();
	const edges = (await edgesOf())!;

	expect(
		edges.root % 1,
		"the lightbox's right edge falls between CSS pixels",
	).toBeGreaterThan(0);
	expect(
		edges.photo,
		"no backdrop shows past the photo's right edge",
	).toBeGreaterThanOrEqual(edges.root);
});
