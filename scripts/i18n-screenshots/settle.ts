import type { Page } from "@playwright/test";

import {
	brokenImagesOnceReady,
	renderTwoFrames,
} from "../store-screenshots/settle";

const REMOVED_TOAST = '[data-sonner-toast][data-removed="true"]';
const pagesShowingLoading = new WeakSet<Page>();

export function showsLoading(page: Page): void {
	pagesShowingLoading.add(page);
}

export async function settle({ page }: { page: Page }): Promise<void> {
	await page.evaluate(() => document.fonts.ready);
	await renderTwoFrames(page);
	const broken = await brokenImagesOnceReady(page, {
		waitForLoading: !pagesShowingLoading.has(page),
	});
	if (broken.length > 0) {
		throw new Error(`Broken images on ${page.url()}: ${broken.join(", ")}`);
	}
	await page.waitForFunction(
		(removed) => document.querySelector(removed) === null,
		REMOVED_TOAST,
	);
	await renderTwoFrames(page);
}
