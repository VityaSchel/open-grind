import type { BrowserContext, Locator, Page, Route } from "@playwright/test";

export const AVATAR_HOST = "**/api.dicebear.com/**";
export const CHAT_MEDIA_HOST = "**/picsum.photos/**";
export const STOCK_PHOTO_HOST = "**/images.unsplash.com/**";

const RIGHT_NOW_FULL_PHOTO_PATH = /\/1024\/1024$/;
const SQUARE_THUMBNAIL = { width: 480, height: 480 };
const PORTRAIT_FULL_PHOTO = { width: 600, height: 800 };
export const PORTRAIT_HEIGHT_PER_WIDTH =
	PORTRAIT_FULL_PHOTO.height / PORTRAIT_FULL_PHOTO.width;

function svgImage({ width, height }: { width: number; height: number }) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#666"/></svg>`;
}

const IMAGE = svgImage(PORTRAIT_FULL_PHOTO);

function fulfillImage(route: Route): Promise<void> {
	return route.fulfill({ contentType: "image/svg+xml", body: IMAGE });
}

export async function serveImages(page: Page, host: string): Promise<void> {
	await page.route(host, fulfillImage);
}

export async function serveDemoImages(context: BrowserContext): Promise<void> {
	await Promise.all(
		[AVATAR_HOST, CHAT_MEDIA_HOST, STOCK_PHOTO_HOST].map((host) =>
			context.route(host, fulfillImage),
		),
	);
}

export async function holdImages(
	page: Page,
	host: string,
): Promise<{ requested: () => number; release: () => Promise<void> }> {
	const held: Route[] = [];
	let released = false;
	await page.route(host, async (route) => {
		if (released) await fulfillImage(route);
		else held.push(route);
	});
	return {
		requested: () => held.length,
		release: async () => {
			released = true;
			await Promise.all(held.splice(0).map(fulfillImage));
		},
	};
}

export async function abortImages(page: Page, host: string): Promise<void> {
	await page.route(host, (route) => route.abort());
}

export async function serveRightNowPortraitPhotos(page: Page): Promise<void> {
	await page.route(CHAT_MEDIA_HOST, (route) =>
		route.fulfill({
			contentType: "image/svg+xml",
			body: svgImage(
				RIGHT_NOW_FULL_PHOTO_PATH.test(
					new URL(route.request().url()).pathname,
				)
					? PORTRAIT_FULL_PHOTO
					: SQUARE_THUMBNAIL,
			),
		}),
	);
}

export async function heightPerWidth(target: Locator): Promise<number | null> {
	const box = await target.boundingBox();
	return box === null || box.width === 0 ? null : box.height / box.width;
}
