import type { Page } from "@playwright/test";

import { TRANSPARENT_PIXEL } from "../../src/lib/util/load-when-visible";

const COVERING_SELECTOR = "vite-error-overlay, [data-sonner-toast]";
const INTEREST_BADGE_SELECTOR = 'nav a[href="/interest"] [data-slot="badge"]';

export async function brokenImagesOnceReady(
	page: Page,
	{ waitForLoading = true }: { waitForLoading?: boolean } = {},
): Promise<string[]> {
	const pageArgs = {
		waitsForLoading: waitForLoading,
		placeholder: TRANSPARENT_PIXEL,
	};
	const ready = await page.waitForFunction((args) => {
		const inViewport = (element: Element) => {
			const rect = element.getBoundingClientRect();
			return (
				element.checkVisibility({ visibilityProperty: true }) &&
				rect.width > 0 &&
				rect.height > 0 &&
				rect.bottom > 0 &&
				rect.right > 0 &&
				rect.top < innerHeight &&
				rect.left < innerWidth
			);
		};
		const unclipped = (element: Element) => {
			let { left, top, right, bottom } = element.getBoundingClientRect();
			for (
				let ancestor = element.parentElement;
				ancestor !== null;
				ancestor = ancestor.parentElement
			) {
				const { overflowX, overflowY } = getComputedStyle(ancestor);
				const clip = ancestor.getBoundingClientRect();
				if (overflowX !== "visible") {
					left = Math.max(left, clip.left);
					right = Math.min(right, clip.right);
				}
				if (overflowY !== "visible") {
					top = Math.max(top, clip.top);
					bottom = Math.min(bottom, clip.bottom);
				}
			}
			return left < right && top < bottom;
		};
		const loading = args.waitsForLoading
			? document.querySelectorAll(
					'[data-slot="skeleton"], [role="status"][aria-label="Loading"]',
				)
			: [];
		const animating = document
			.getAnimations()
			.some(
				(animation) =>
					animation.playState === "running" &&
					animation.effect?.getComputedTiming().iterations !==
						Infinity,
			);
		const images = [...document.images].filter(inViewport);
		const placeholders = images.filter(
			(image) => image.getAttribute("src") === args.placeholder,
		);
		if (
			[...loading].some(inViewport) ||
			animating ||
			!images.every((image) => image.complete) ||
			placeholders.some(unclipped)
		) {
			return false;
		}
		return images
			.filter((image) => image.naturalWidth === 0)
			.map((image) => image.currentSrc || image.src);
	}, pageArgs);
	return ready.jsonValue() as Promise<string[]>;
}

export async function renderTwoFrames(page: Page): Promise<void> {
	await page.evaluate(
		() =>
			new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			),
	);
}

export async function settle(page: Page): Promise<void> {
	await page.waitForLoadState("networkidle");
	await page.evaluate(() => document.fonts.ready);
	await renderTwoFrames(page);
	const broken = await brokenImagesOnceReady(page);
	if (broken.length > 0) {
		throw new Error(`Broken images on ${page.url()}: ${broken.join(", ")}`);
	}
	if ((await page.locator(COVERING_SELECTOR).count()) > 0) {
		throw new Error(`An error overlay or a toast covers ${page.url()}`);
	}
	if ((await page.locator(INTEREST_BADGE_SELECTOR).count()) > 0) {
		throw new Error(
			`The Interest badge shows on ${page.url()}: this load has newer taps than the ones viewed at launch`,
		);
	}
	await renderTwoFrames(page);
}
