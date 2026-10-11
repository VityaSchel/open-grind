import { expect, type Page } from "@playwright/test";

import {
	afterTwoFrames,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./app";
import { AVATAR_HOST } from "./media";

const FOUR_PHOTO_PROFILE = "/profile/100004";
const PHOTO_COUNT = 4;
const CAROUSEL = ".carousel";
const CAROUSEL_PHOTO = `${CAROUSEL} .item img`;
const RED_OVER_BLUE = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="400" fill="#f00"/><rect y="400" width="600" height="400" fill="#00f"/></svg>`;
const PROBE_COLUMN = 0.2;
const CLIP_MARGIN_PX = 1;

type Band = "red" | "blue";

async function openFourPhotoProfile(page: Page): Promise<void> {
	await page.route(AVATAR_HOST, (route) =>
		route.fulfill({ contentType: "image/svg+xml", body: RED_OVER_BLUE }),
	);
	await installTauriShim(page);
	await page.goto(FOUR_PHOTO_PROFILE);
	await page.locator(CAROUSEL).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

async function restOnPhoto(
	page: Page,
	{ index }: { index: number },
): Promise<void> {
	await page.locator(CAROUSEL).evaluate((gallery, index) => {
		gallery.scrollTo({
			top: index * gallery.getBoundingClientRect().height,
			behavior: "instant",
		});
	}, index);
	await afterTwoFrames(page);
}

async function everyPhotoLoaded(page: Page): Promise<void> {
	await expect(page.locator(CAROUSEL_PHOTO)).toHaveCount(PHOTO_COUNT);
	await expect
		.poll(() =>
			page
				.locator(CAROUSEL_PHOTO)
				.evaluateAll((images: HTMLImageElement[]) =>
					images.every(
						(image) => image.complete && image.naturalWidth > 0,
					),
				),
		)
		.toBe(true);
}

async function bandsDownTheCarousel(page: Page): Promise<Band[]> {
	const box = await page.locator(CAROUSEL).boundingBox();
	if (box === null) throw new Error("the carousel is not laid out");
	const shot = await page.screenshot({
		clip: {
			x: box.x,
			y: box.y - CLIP_MARGIN_PX,
			width: box.width,
			height: box.height + 2 * CLIP_MARGIN_PX,
		},
		caret: "hide",
	});
	return page.evaluate(
		async ({ base64, column }) => {
			const response = await fetch(`data:image/png;base64,${base64}`);
			const bitmap = await createImageBitmap(await response.blob());
			const context = new OffscreenCanvas(
				bitmap.width,
				bitmap.height,
			).getContext("2d");
			if (!context) throw new Error("no 2d context");
			context.drawImage(bitmap, 0, 0);
			const x = Math.round(bitmap.width * column);
			const pixels = context.getImageData(x, 0, 1, bitmap.height).data;
			const bands: Band[] = [];
			for (let row = 0; row < bitmap.height; row++) {
				const [red = 0, green = 0, blue = 0] = pixels.subarray(
					row * 4,
					row * 4 + 3,
				);
				const band: Band | null =
					red > 200 && green < 60 && blue < 60
						? "red"
						: blue > 200 && red < 60 && green < 60
							? "blue"
							: null;
				if (band !== null && bands.at(-1) !== band) bands.push(band);
			}
			return bands;
		},
		{ base64: shot.toString("base64"), column: PROBE_COLUMN },
	);
}

export async function expectPhotosToRestWithoutNeighbors(
	page: Page,
	{ devicePixelRatio }: { devicePixelRatio: number },
): Promise<void> {
	await openFourPhotoProfile(page);
	for (let index = 0; index < PHOTO_COUNT; index++)
		await restOnPhoto(page, { index });
	await everyPhotoLoaded(page);

	const frameHeight = await page
		.locator(CAROUSEL)
		.evaluate(
			(gallery) => gallery.parentElement!.getBoundingClientRect().height,
		);
	expect(
		(frameHeight * devicePixelRatio) % 1,
		"the photo frame ends partway through a device pixel",
	).toBeGreaterThan(0);

	for (let index = 0; index < PHOTO_COUNT; index++) {
		await restOnPhoto(page, { index });
		expect(
			await bandsDownTheCarousel(page),
			`photo ${index + 1} shows its own top and bottom only`,
		).toEqual(["red", "blue"]);
	}
}
