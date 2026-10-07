import { expect, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	installTauriShim,
	openGrid,
	TrustedTouch,
} from "./support/app";
import { AVATAR_HOST, serveImages } from "./support/media";
import {
	ACTIVE_PANE,
	activeProfilePane,
	PANE,
	profileLoaded,
	profilePager,
	profileUrl,
} from "./support/profile-pager";

const DEVICE_PIXEL_RATIO = 2.6875;
const WINDOW = { width: 452, height: 800 };
const GRID_SCROLLER = ".pull-scroller";
const GRID_CONTENT = '[data-slot="grid-content"]';
const GRID_TILE = '.photo-grid a[href^="/profile/"]';
const GRID_PAGES_TO_LOAD = 3;

test.describe.configure({ timeout: 300_000 });

test.use({
	viewport: null,
	deviceScaleFactor: ({ contextOptions }, use) =>
		use(contextOptions.deviceScaleFactor),
	launchOptions: ({ launchOptions }, use) =>
		use({
			...launchOptions,
			args: [
				...(launchOptions.args ?? []),
				`--force-device-scale-factor=${DEVICE_PIXEL_RATIO}`,
				`--window-size=${WINDOW.width},${WINDOW.height}`,
			],
		}),
});

async function openDeepGridProfile(page: Page): Promise<number> {
	await serveImages(page, AVATAR_HOST);
	await installTauriShim(page);
	await openGrid(page);
	const scroller = page.locator(GRID_SCROLLER);
	const loadingMore = page.getByText("Loading more profiles");
	await page.locator(GRID_TILE).first().waitFor({ timeout: 60_000 });
	for (let loaded = 0; loaded < GRID_PAGES_TO_LOAD; loaded++) {
		await afterTwoFrames(page);
		const height = await scroller.evaluate((node) => node.scrollHeight);
		await scroller.evaluate((node) =>
			node.scrollTo({ top: node.scrollHeight }),
		);
		await expect
			.poll(() => scroller.evaluate((node) => node.scrollHeight), {
				timeout: 30_000,
			})
			.toBeGreaterThan(height);
		await expect(loadingMore).toHaveCount(0, { timeout: 30_000 });
	}
	await afterTwoFrames(page);
	const profileId = await page
		.locator(GRID_CONTENT)
		.evaluate((content, tile) => {
			const view = content.parentElement!.getBoundingClientRect();
			const { paddingTop, paddingBottom } = getComputedStyle(content);
			const top = view.top + parseFloat(paddingTop);
			const bottom = view.bottom - parseFloat(paddingBottom);
			const shown = [...content.querySelectorAll(tile)].find((link) => {
				const rect = link.getBoundingClientRect();
				const withPhoto = link.querySelector("img") !== null;
				return withPhoto && rect.top >= top && rect.bottom <= bottom;
			});
			return Number(shown?.getAttribute("href")?.split("/").at(-1));
		}, GRID_TILE);
	await page.locator(`${GRID_TILE}[href="/profile/${profileId}"]`).click();
	await expect(page).toHaveURL(profileUrl(profileId));
	await profileLoaded(page);
	return profileId;
}

function activePosition(page: Page): Promise<number> {
	return activeProfilePane(page).evaluate(
		(pane) => parseFloat(pane.style.left) / 100,
	);
}

function driftOfFlooredWidth(
	page: Page,
	{ position }: { position: number },
): Promise<number> {
	return profilePager(page).evaluate(
		(pager, at) =>
			new Promise<number>((resolve) => {
				const observer = new ResizeObserver(([entry]) => {
					observer.disconnect();
					const exact =
						entry!.devicePixelContentBoxSize[0]!.inlineSize /
						devicePixelRatio;
					const floored = entry!.contentBoxSize[0]!.inlineSize;
					resolve(at * (exact - floored));
				});
				observer.observe(pager);
			}),
		position,
	);
}

async function paneOnScreenIsActive(page: Page): Promise<boolean> {
	await afterTwoFrames(page);
	return profilePager(page).evaluate(
		(pager, { pane, active }) => {
			const view = pager.getBoundingClientRect();
			const onScreen = [...pager.querySelectorAll(pane)].find(
				(section) =>
					Math.abs(section.getBoundingClientRect().left - view.left) <
					1,
			);
			return onScreen?.matches(active) === true;
		},
		{ pane: PANE, active: ACTIVE_PANE },
	);
}

async function expectInteractive(page: Page): Promise<void> {
	await expect.poll(() => paneOnScreenIsActive(page)).toBe(true);
	const pane = activeProfilePane(page);
	await expect(pane).not.toHaveAttribute("inert");
	await expect(pane.locator("main")).not.toHaveAttribute("inert");
}

async function swipeToNextProfile(page: Page): Promise<void> {
	const pager = (await profilePager(page).boundingBox())!;
	const heading = (await activeProfilePane(page)
		.locator("h1")
		.boundingBox())!;
	const y = heading.y + heading.height / 2;
	const touch = await TrustedTouch.attach(page);
	await touch.drag(
		page,
		{ x: pager.x + pager.width * 0.85, y },
		{ x: pager.x + pager.width * 0.15, y },
		{ steps: 16, holdMs: 16 },
	);
}

async function tapFirstPhoto(page: Page): Promise<void> {
	const photo = (await activeProfilePane(page)
		.locator("a.item")
		.first()
		.boundingBox())!;
	await page.touchscreen.tap(
		photo.x + photo.width / 2,
		photo.y + photo.height / 2,
	);
}

function lightboxOpen(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const { pswp } = window as { pswp?: { opener: { isOpen: boolean } } };
		return pswp?.opener.isOpen === true;
	});
}

test("a deep profile at a fractional device pixel ratio stays interactive", async ({
	page,
}) => {
	const openedId = await openDeepGridProfile(page);
	const position = await activePosition(page);
	expect(
		await driftOfFlooredWidth(page, { position }),
		"paging by the floored width misses this pane by a pixel",
	).toBeGreaterThan(1);

	await expectInteractive(page);
	await tapFirstPhoto(page);
	await expect.poll(() => lightboxOpen(page)).toBe(true);
	await page.keyboard.press("Escape");
	await expect(page.locator(".pswp")).toHaveCount(0);

	await swipeToNextProfile(page);

	await expect(page).not.toHaveURL(profileUrl(openedId));
	expect(await activePosition(page)).toBe(position + 1);
	await expectInteractive(page);
});
