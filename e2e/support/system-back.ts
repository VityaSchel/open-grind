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

export async function startSystemBackMidSlide(page: Page, pane: string) {
	return page.evaluate(async (selector) => {
		const state = window as unknown as { __backProgress: number };
		state.__backProgress = 0;
		window.__AndroidBack = {
			moveTaskToBack: () => {},
			gestureProgress: () => state.__backProgress,
		};
		const nextFrame = () => new Promise(requestAnimationFrame);
		const offset = () =>
			document.querySelector(selector)?.getBoundingClientRect().x ??
			innerWidth;
		const sliding = () =>
			document
				.querySelector(selector)
				?.getAnimations()
				.some((animation) => animation.playState === "running");
		while (!sliding() || offset() > innerWidth * 0.9) await nextFrame();

		const before = offset();
		const started = window.__AndroidOnBackGestureStart?.() ?? false;
		const pickedUp = offset();
		await nextFrame();
		return { started, before, pickedUp, aFrameLater: offset() };
	}, pane);
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
