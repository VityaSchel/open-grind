import type { Page } from "@playwright/test";

export const AVATAR_HOST = "**/api.dicebear.com/**";
export const CHAT_MEDIA_HOST = "**/picsum.photos/**";

const IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#666"/></svg>`;

export async function serveImages(page: Page, host: string): Promise<void> {
	await page.route(host, (route) =>
		route.fulfill({ contentType: "image/svg+xml", body: IMAGE }),
	);
}

export async function abortImages(page: Page, host: string): Promise<void> {
	await page.route(host, (route) => route.abort());
}
