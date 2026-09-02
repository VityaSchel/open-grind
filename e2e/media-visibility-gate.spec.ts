import { expect, type Page, test } from "@playwright/test";

import {
	PREFETCH_MARGIN_PX,
	TRANSPARENT_PIXEL,
} from "../src/lib/util/load-when-visible";
import { ensureGridLocation, installTauriShim } from "./support/app";
import { AVATAR_HOST, serveImages } from "./support/media";

const SCROLLER = ".pull-scroller";
const PROFILE_LINK = 'a[href^="/profile/"]';

const JUMP_PAST_MOUNTED_BAND = 3000;

type Tile = { armed: boolean; gapBelow: number; onScreen: boolean };

async function openGrid(page: Page) {
	test.setTimeout(180_000);
	await installTauriShim(page);
	await serveImages(page, AVATAR_HOST);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);
	await page.locator(PROFILE_LINK).first().waitFor({ timeout: 60_000 });
	for (let page_ = 0; page_ < 5; page_++) {
		await page.evaluate((selector) => {
			const scroller = document.querySelector(selector)!;
			scroller.scrollTo({ top: scroller.scrollHeight });
		}, SCROLLER);
		await page.waitForTimeout(400);
	}
}

async function scrollTo(page: Page, top: number) {
	await page.evaluate(
		({ selector, offset }) => {
			document.querySelector(selector)!.scrollTo({ top: offset });
		},
		{ selector: SCROLLER, offset: top },
	);
	await page.waitForTimeout(400);
}

function tiles(page: Page, placeholder: string): Promise<Tile[]> {
	return page.evaluate(
		({ selector, link, blank }) => {
			const view = document
				.querySelector(selector)!
				.getBoundingClientRect();
			return [...document.querySelectorAll(`${link} img`)].map((img) => {
				const rect = img.getBoundingClientRect();
				return {
					armed: img.getAttribute("src") !== blank,
					gapBelow: rect.top - view.bottom,
					onScreen: rect.bottom > view.top && rect.top < view.bottom,
				};
			});
		},
		{ selector: SCROLLER, link: PROFILE_LINK, blank: placeholder },
	);
}

test.describe("media visibility gate", () => {
	test("loads what is on screen and holds back what is far below", async ({
		page,
	}) => {
		await openGrid(page);

		for (const offset of [
			JUMP_PAST_MOUNTED_BAND,
			JUMP_PAST_MOUNTED_BAND * 2,
			JUMP_PAST_MOUNTED_BAND * 3,
		]) {
			await scrollTo(page, offset);
			const mounted = await tiles(page, TRANSPARENT_PIXEL);

			const onScreen = mounted.filter((tile) => tile.onScreen);
			expect(onScreen.length).toBeGreaterThan(4);
			expect(onScreen.filter((tile) => !tile.armed)).toHaveLength(0);

			const farBelow = mounted.filter(
				(tile) => tile.gapBelow > PREFETCH_MARGIN_PX,
			);
			expect(farBelow.length).toBeGreaterThan(2);
			expect(farBelow.filter((tile) => tile.armed)).toHaveLength(0);
		}
	});

	test("arms a held-back tile once it is scrolled into view", async ({
		page,
	}) => {
		await openGrid(page);
		await scrollTo(page, JUMP_PAST_MOUNTED_BAND);

		const before = await tiles(page, TRANSPARENT_PIXEL);
		const target = before
			.filter((tile) => tile.gapBelow > PREFETCH_MARGIN_PX)
			.sort((a, b) => a.gapBelow - b.gapBelow)[0];
		expect(target).toBeDefined();
		expect(target!.armed).toBe(false);

		await scrollTo(page, JUMP_PAST_MOUNTED_BAND + target!.gapBelow + 300);

		const after = await tiles(page, TRANSPARENT_PIXEL);
		const onScreen = after.filter((tile) => tile.onScreen);
		expect(onScreen.length).toBeGreaterThan(4);
		expect(onScreen.filter((tile) => !tile.armed)).toHaveLength(0);
	});

	test("shows photos again on the way back up", async ({ page }) => {
		await openGrid(page);
		await scrollTo(page, JUMP_PAST_MOUNTED_BAND * 3);
		await scrollTo(page, 0);

		const mounted = await tiles(page, TRANSPARENT_PIXEL);
		const onScreen = mounted.filter((tile) => tile.onScreen);

		expect(onScreen.length).toBeGreaterThan(4);
		expect(onScreen.filter((tile) => !tile.armed)).toHaveLength(0);
	});
});
