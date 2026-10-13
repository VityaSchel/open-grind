import type { Page } from "@playwright/test";

const COVERING_SELECTOR = "vite-error-overlay, [data-sonner-toast]";
const INTEREST_BADGE_SELECTOR = 'nav a[href="/interest"] [data-slot="badge"]';

export async function brokenImagesOnceReady(
	page: Page,
	{ waitForLoading = true }: { waitForLoading?: boolean } = {},
): Promise<string[]> {
	const ready = await page.waitForFunction((waitsForLoading) => {
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
		const loading = waitsForLoading
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
		if (
			[...loading].some(inViewport) ||
			animating ||
			!images.every((image) => image.complete)
		) {
			return false;
		}
		return images
			.filter((image) => image.naturalWidth === 0)
			.map((image) => image.currentSrc || image.src);
	}, waitForLoading);
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
