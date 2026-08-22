import { expect, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";

const ALBUM_TRIGGER = 'button[aria-label="Open album"]';
const LIGHTBOX = ".pswp";
const SLIDE_IMAGE = ".pswp__img";
const CLOSE_BUTTON = ".pswp__button--close";
const PROFILE_LINK = 'a[href="/profile/100001"]';

const WIDTH = 420;
const KEYBOARD_OPEN_HEIGHT = 500;
const SETTLED_HEIGHT = 800;
const CUTOUT = 40;

type Rect = { top: number; height: number };

async function enterConversation(page: Page): Promise<void> {
	await serveImages(page, CHAT_MEDIA_HOST);
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	await page.locator(ALBUM_TRIGGER).first().waitFor({ timeout: 60_000 });
}

async function openAlbum(page: Page): Promise<void> {
	await page.locator(ALBUM_TRIGGER).first().click();
	await page.locator(LIGHTBOX).waitFor({ timeout: 30_000 });
}

function slideRect(page: Page): Promise<Rect | null> {
	return page.evaluate((selector) => {
		const rect = document.querySelector(selector)?.getBoundingClientRect();
		if (rect === undefined || rect.height === 0) return null;
		return { top: rect.top, height: rect.height };
	}, SLIDE_IMAGE);
}

test.describe("lightbox layout", () => {
	test("the chrome clears the top inset", async ({ page }) => {
		await enterConversation(page);
		await openAlbum(page);

		const measured = await page.evaluate(
			({ bar, close }) => ({
				inset:
					parseFloat(
						getComputedStyle(
							document.documentElement,
						).getPropertyValue("--safe-area-top"),
					) || 0,
				barTop:
					document.querySelector(bar)?.getBoundingClientRect().top ??
					null,
				closeTop:
					document.querySelector(close)?.getBoundingClientRect()
						.top ?? null,
			}),
			{ bar: ".pswp__top-bar", close: CLOSE_BUTTON },
		);

		expect(measured.inset, "test insets are active").toBeGreaterThan(0);
		expect(
			measured.barTop,
			"the top bar starts below the status bar",
		).toBeCloseTo(measured.inset, 0);
		expect(
			measured.closeTop,
			"the close button starts below the status bar",
		).toBeCloseTo(measured.inset, 0);
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
					const rect = await slideRect(page);
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
		await page.locator(".carousel").waitFor({ timeout: 30_000 });
		await page.goBack();
		await page.locator(ALBUM_TRIGGER).first().waitFor({ timeout: 30_000 });

		await openAlbum(page);
		await expect(
			page.locator(CLOSE_BUTTON),
			"the profile lightbox hides its buttons, the chat one must not",
		).toBeVisible();
	});
});
