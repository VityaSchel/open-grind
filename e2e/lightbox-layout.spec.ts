import { expect, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";

const ALBUM_TRIGGER = 'button[aria-label="Open album"]';
const LIGHTBOX = ".pswp";
const SLIDE_IMAGE = ".pswp__img";
const TOP_BAR = ".pswp__top-bar";
const CLOSE_BUTTON = ".pswp__button--close";
const NEXT_BUTTON = ".pswp__button--arrow--next";
const CAROUSEL = ".carousel";
const CAROUSEL_PHOTO = `${CAROUSEL} .item`;
const CAROUSEL_ITEM = `${CAROUSEL_PHOTO}[href]`;
const PROFILE_LINK = 'a[href="/profile/100001"]';
const FOUR_PHOTO_PROFILE = "/profile/100004";
const ACTIVE_SLIDE_IMAGE = `.pswp__item:not([aria-hidden="true"]) ${SLIDE_IMAGE}:not(.pswp__img--placeholder)`;
const PHOTO_ASPECT = 4 / 3;

const WIDTH = 420;
const KEYBOARD_OPEN_HEIGHT = 500;
const SETTLED_HEIGHT = 800;
const CUTOUT = 40;

type Rect = { top: number; width: number; height: number };

async function enterConversation(page: Page): Promise<void> {
	await serveImages(page, CHAT_MEDIA_HOST);
	await serveImages(page, AVATAR_HOST);
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	await page.locator(ALBUM_TRIGGER).first().waitFor({ timeout: 60_000 });
}

async function openAlbum(page: Page): Promise<void> {
	await page.locator(ALBUM_TRIGGER).first().click();
	await page.locator(LIGHTBOX).waitFor({ timeout: 30_000 });
}

async function enterFourPhotoProfile(page: Page): Promise<void> {
	await serveImages(page, AVATAR_HOST);
	await installTauriShim(page);
	await page.goto(FOUR_PHOTO_PROFILE);
	await expect(page.locator(CAROUSEL_PHOTO)).toHaveCount(4, {
		timeout: 120_000,
	});
}

async function openCarouselLightbox(page: Page): Promise<void> {
	await page.locator(CAROUSEL_ITEM).first().click();
	await page.locator(LIGHTBOX).waitFor({ timeout: 30_000 });
}

async function openProfileCarousel(page: Page): Promise<void> {
	await page.locator(PROFILE_LINK).first().click();
	await page.locator(CAROUSEL).waitFor({ timeout: 30_000 });
	await openCarouselLightbox(page);
}

function topInset(page: Page): Promise<number> {
	return page.evaluate(
		() =>
			parseFloat(
				getComputedStyle(document.documentElement).getPropertyValue(
					"--safe-area-top",
				),
			) || 0,
	);
}

function openLightboxIndex(page: Page): Promise<number | null> {
	return page.evaluate(() => {
		const { pswp } = window as {
			pswp?: { currIndex: number; opener: { isOpen: boolean } };
		};
		return pswp?.opener.isOpen ? pswp.currIndex : null;
	});
}

function slideWidth(
	page: Page,
	{ index }: { index: number },
): Promise<number | null> {
	return page.evaluate((index) => {
		const { pswp } = window as {
			pswp?: {
				mainScroll: {
					itemHolders: { slide?: { index: number; width: number } }[];
				};
			};
		};
		return (
			pswp?.mainScroll.itemHolders.find(
				(holder) => holder.slide?.index === index,
			)?.slide?.width ?? null
		);
	}, index);
}

function slideRect(
	page: Page,
	{ selector }: { selector: string },
): Promise<Rect | null> {
	return page.evaluate((selector) => {
		const rect = document.querySelector(selector)?.getBoundingClientRect();
		if (rect === undefined || rect.width === 0 || rect.height === 0)
			return null;
		return { top: rect.top, width: rect.width, height: rect.height };
	}, selector);
}

test.describe("lightbox layout", () => {
	test("the chrome clears the top inset", async ({ page }) => {
		await enterConversation(page);
		await openAlbum(page);

		const inset = await topInset(page);
		const bar = await page.locator(TOP_BAR).boundingBox();
		const close = await page.locator(CLOSE_BUTTON).boundingBox();

		expect(inset, "test insets are active").toBeGreaterThan(0);
		expect(bar?.y, "the top bar starts below the status bar").toBeCloseTo(
			inset,
			0,
		);
		expect(
			close?.y,
			"the close button starts below the status bar",
		).toBeCloseTo(inset, 0);
	});

	test("the chrome clears a side cutout", async ({ page }) => {
		await enterConversation(page);
		await openAlbum(page);

		const closeRight = await page.evaluate(
			({ close, inset }) => {
				document.documentElement.style.setProperty(
					"--safe-area-right",
					`${inset}px`,
				);
				return document.querySelector(close)?.getBoundingClientRect()
					.right;
			},
			{ close: CLOSE_BUTTON, inset: CUTOUT },
		);

		expect(
			WIDTH - (closeRight ?? 0),
			"the close button clears the cutout plus its own margin",
		).toBeGreaterThanOrEqual(CUTOUT);
	});

	test("the photo recenters when the keyboard collapses mid-open", async ({
		page,
	}) => {
		await enterConversation(page);
		await page.setViewportSize({
			width: WIDTH,
			height: KEYBOARD_OPEN_HEIGHT,
		});
		// PhotoSwipe binds its own resize listener only once the opening
		// animation ends, so nothing may be awaited in between.
		await openAlbum(page);
		await page.setViewportSize({ width: WIDTH, height: SETTLED_HEIGHT });

		const stillOpening = await page.evaluate((selector) => {
			const root = document.querySelector(selector);
			return (
				root !== null && parseFloat(getComputedStyle(root).opacity) < 1
			);
		}, LIGHTBOX);
		expect(
			stillOpening,
			"the viewport grew while the lightbox was still opening",
		).toBe(true);

		await expect
			.poll(
				async () => {
					const rect = await slideRect(page, {
						selector: SLIDE_IMAGE,
					});
					if (rect === null) return null;
					return Math.round(
						rect.top - (SETTLED_HEIGHT - rect.height) / 2,
					);
				},
				{ message: "the photo settles centered in the grown viewport" },
			)
			.toBe(0);
	});

	test("the profile carousel's chrome overrides stay off the chat lightbox", async ({
		page,
	}) => {
		await enterConversation(page);
		await page.locator(PROFILE_LINK).first().click();
		await page.locator(CAROUSEL).waitFor({ timeout: 30_000 });
		await page.goBack();
		await page.locator(ALBUM_TRIGGER).first().waitFor({ timeout: 30_000 });

		await openAlbum(page);
		await expect(
			page.locator(CLOSE_BUTTON),
			"the profile lightbox hides its buttons, the chat one must not",
		).toBeVisible();
	});

	test("the profile carousel keeps its close button inside the top bar", async ({
		page,
	}) => {
		await enterConversation(page);
		await openProfileCarousel(page);

		await expect(
			page.locator(CLOSE_BUTTON),
			"the carousel keeps a way out",
		).toBeVisible();
		await expect(
			page.locator(NEXT_BUTTON),
			"the rest of the chrome stays hidden",
		).toBeHidden();

		const inset = await topInset(page);
		const bar = await page.locator(TOP_BAR).boundingBox();
		const close = await page.locator(CLOSE_BUTTON).boundingBox();
		if (bar === null || close === null)
			throw new Error("the lightbox chrome is not laid out");

		expect(inset, "test insets are active").toBeGreaterThan(0);
		expect(
			close.y,
			"the button does not re-apply the inset the bar already carries",
		).toBeGreaterThanOrEqual(bar.y);
		expect(
			close.y + close.height,
			"the button stays inside the bar instead of floating over the photo",
		).toBeLessThanOrEqual(bar.y + bar.height);
	});

	test("opening the profile lightbox starts loading every carousel photo", async ({
		page,
	}) => {
		await enterFourPhotoProfile(page);
		const carouselImages = page.locator(`${CAROUSEL_PHOTO} img`);
		await expect(
			carouselImages,
			"photos past the eager reach wait for a scroll",
		).toHaveCount(3);

		await openCarouselLightbox(page);

		await expect(carouselImages).toHaveCount(4);
	});

	test("a profile photo that loads after its lightbox slide was built keeps its aspect ratio", async ({
		page,
	}) => {
		await enterFourPhotoProfile(page);
		const lastPhotoUrl = await page
			.locator(CAROUSEL_PHOTO)
			.last()
			.evaluate((anchor: HTMLAnchorElement) => anchor.href);
		const lastPhotoHeld = Promise.withResolvers<void>();
		await page.route(
			(url) => url.href === lastPhotoUrl,
			async (route) => {
				await lastPhotoHeld.promise;
				await route.fallback();
			},
		);

		await openCarouselLightbox(page);
		await expect.poll(() => openLightboxIndex(page)).toBe(0);
		await expect
			.poll(() => slideWidth(page, { index: 3 }), {
				message:
					"the looped previous slide is built before its photo loads",
			})
			.toBe(0);

		lastPhotoHeld.resolve();
		await page.keyboard.press("ArrowLeft");
		await expect.poll(() => openLightboxIndex(page)).toBe(3);
		await expect
			.poll(
				async () => {
					const rect = await slideRect(page, {
						selector: ACTIVE_SLIDE_IMAGE,
					});
					return rect === null ? null : rect.height / rect.width;
				},
				{ message: "the late photo is not stretched to the viewport" },
			)
			.toBeCloseTo(PHOTO_ASPECT, 2);
	});
});
