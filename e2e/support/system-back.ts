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

type ArmedInternals = {
	invoke: (cmd: string, args?: unknown, opts?: unknown) => Promise<unknown>;
};

type EdgeSwipeWindow = { __iosBackArmed?: boolean; __iosBackArms?: boolean[] };

export async function fakeIosEdgeSwipe(page: Page) {
	await page.addInitScript(() => {
		const internals = (
			window as unknown as { __TAURI_INTERNALS__: ArmedInternals }
		).__TAURI_INTERNALS__;
		const passThrough = internals.invoke;
		const state = window as unknown as EdgeSwipeWindow;
		const arms: boolean[] = [];
		state.__iosBackArmed = false;
		state.__iosBackArms = arms;
		internals.invoke = (cmd, args, opts) => {
			if (cmd === "set_back_swipe_armed") {
				const { armed } = args as { armed: boolean };
				state.__iosBackArmed = armed;
				arms.push(armed);
			}
			return passThrough(cmd, args, opts);
		};
	});
}

export const edgeSwipeArmed = (page: Page) =>
	page.evaluate(
		() => (window as unknown as EdgeSwipeWindow).__iosBackArmed === true,
	);

export const edgeSwipeArmsSent = (page: Page) =>
	page.evaluate(
		() => (window as unknown as EdgeSwipeWindow).__iosBackArms ?? [],
	);

export const startEdgeSwipeUnarmed = (page: Page) =>
	page.evaluate(
		() => window.__iosBack?.start({ x: 2, y: innerHeight / 2 }) ?? null,
	);

export async function startEdgeSwipe(page: Page) {
	return page.evaluate(() => {
		if ((window as unknown as EdgeSwipeWindow).__iosBackArmed !== true)
			return false;
		return window.__iosBack?.start({ x: 2, y: innerHeight / 2 }) === true;
	});
}

export async function progressEdgeSwipe(page: Page, progress: number) {
	await page.evaluate((value) => window.__iosBack?.progress(value), progress);
	await afterTwoFrames(page);
}

export const releaseEdgeSwipe = (
	page: Page,
	release: { commit: boolean; velocity: number },
) => page.evaluate((value) => window.__iosBack?.finish(value), release);
