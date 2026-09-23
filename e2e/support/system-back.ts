import type { Page } from "@playwright/test";

import { afterTwoFrames } from "./app";

export async function startSystemBack(page: Page) {
	return page.evaluate(() => {
		const state = window as unknown as { __backProgress: number };
		state.__backProgress = 0;
		window.__AndroidBack = {
			moveTaskToBack: () => {},
			gestureProgress: () => state.__backProgress,
		};
		return window.__AndroidOnBackGestureStart?.() ?? false;
	});
}

export async function progressSystemBack(page: Page, progress: number) {
	await page.evaluate((value) => {
		(window as unknown as { __backProgress: number }).__backProgress =
			value;
	}, progress);
	await afterTwoFrames(page);
}

export const commitSystemBack = (page: Page) =>
	page.evaluate(() => window.__AndroidOnBackGesture?.());

export const cancelSystemBack = (page: Page) =>
	page.evaluate(() => window.__AndroidOnBackGestureCancel?.());
