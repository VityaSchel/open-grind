import type { Page, Route } from "@playwright/test";

export const AVATAR_HOST = "**/api.dicebear.com/**";
export const CHAT_MEDIA_HOST = "**/picsum.photos/**";

const IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#666"/></svg>`;

function fulfillImage(route: Route): Promise<void> {
	return route.fulfill({ contentType: "image/svg+xml", body: IMAGE });
}

export async function serveImages(page: Page, host: string): Promise<void> {
	await page.route(host, fulfillImage);
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
