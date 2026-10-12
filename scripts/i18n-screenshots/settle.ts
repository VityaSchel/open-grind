import type { Page } from "@playwright/test";

import {
	brokenImagesOnceReady,
	renderTwoFrames,
} from "../store-screenshots/settle";

export async function settle({ page }: { page: Page }): Promise<void> {
	await page.evaluate(() => document.fonts.ready);
	await renderTwoFrames(page);
	const broken = await brokenImagesOnceReady(page);
	if (broken.length > 0) {
		throw new Error(`Broken images on ${page.url()}: ${broken.join(", ")}`);
	}
	await renderTwoFrames(page);
}
