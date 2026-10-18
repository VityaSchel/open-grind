import { expect, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	TrustedTouch,
} from "./support/app";
import { storedPreferences } from "./support/app-data";
import { failDemoRequests, recordDemoRequests } from "./support/demo-faults";
import {
	box,
	DRAWER,
	expandSheet,
	expandToFull,
	openComposerSheet,
	openSheetFromComposer,
	scrollSheetBy,
	scrollSheetTo,
	snapTops,
} from "./support/drawer";
import {
	DEMO_GIPHY_EMPTY_QUERY,
	DEMO_GIPHY_MISSING_ID,
	DEMO_GIPHY_TRENDING_TOTAL,
	demoTrendingLabel,
	GIF_SEARCH_BAR,
	gifPanel,
	gifSearchBox,
	gifTiles,
	GIPHY_CONSENT_NOTE,
	GIPHY_PAGE_SIZE,
	GIPHY_TRENDING_PATH,
	giphyCalls,
	giphyTrendingPageAt,
	openStickers,
	refuseRealGiphy,
	SELECTED_STICKER_TILE,
	STICKER_GRID_SKELETON,
	stickerSendButton,
	tileLabels,
} from "./support/stickers";

const SEARCH_DEBOUNCE_MS = 400;
const FIRST_PAGING_AUTO_RETRY_MS = 2_000;
const GIPHY_RATE_LIMITED = 429;
const GIPHY_LINK =
	"https://giphy.com/gifs/portlandia-season-2-episode-xT0xeChUR33EsYNNRK";
const GIF_SEARCH_INPUT = 'input[aria-label="Search GIFs or paste GIPHY link"]';
const GIF_PAGING_SENTINEL = '[data-slot="gif-paging-sentinel"]';
const STICKER_ERROR = '[data-slot="sticker-error"]';

type SearchTimeline = {
	inputs: number[];
	enters: number[];
	skeletons: number[];
};
type TimelineWindow = Window & { __searchTimeline: SearchTimeline };

function trendingLabels(count: number): string[] {
	return Array.from({ length: count }, (_, index) =>
		demoTrendingLabel(index),
	);
}

function consentSwitch(page: Page) {
	return page.getByRole("switch", { name: /^GIF search via GIPHY/ });
}

function agreeButton(page: Page) {
	return page.getByRole("button", { name: "Continue" });
}

async function watchSearchTimeline(
	page: Page,
): Promise<() => Promise<SearchTimeline>> {
	await page.evaluate(
		({ searchInput, skeleton }) => {
			const timeline: SearchTimeline = {
				inputs: [],
				enters: [],
				skeletons: [],
			};
			(window as unknown as TimelineWindow).__searchTimeline = timeline;
			const fromSearchInput = ({ target }: Event) =>
				target instanceof Element && target.matches(searchInput);
			window.addEventListener(
				"input",
				(event) => {
					if (fromSearchInput(event))
						timeline.inputs.push(performance.now());
				},
				{ capture: true },
			);
			window.addEventListener(
				"keydown",
				(event) => {
					if (fromSearchInput(event) && event.key === "Enter")
						timeline.enters.push(performance.now());
				},
				{ capture: true },
			);
			let shown = document.querySelector(skeleton) !== null;
			new MutationObserver(() => {
				const showing = document.querySelector(skeleton) !== null;
				if (showing && !shown)
					timeline.skeletons.push(performance.now());
				shown = showing;
			}).observe(document.body, { subtree: true, childList: true });
		},
		{ searchInput: GIF_SEARCH_INPUT, skeleton: STICKER_GRID_SKELETON },
	);
	return () =>
		page.evaluate(
			() => (window as unknown as TimelineWindow).__searchTimeline,
		);
}

test.describe("GIPHY consent", () => {
	test("the GIF tab asks first and sends nothing to GIPHY before Agree", async ({
		page,
	}) => {
		const requests = await recordDemoRequests(page);
		const realGiphy = await refuseRealGiphy(page);
		await openStickers(page, { giphyConsent: false });

		const note = page.locator(GIPHY_CONSENT_NOTE);
		await expect(note).toBeVisible();
		await expect(
			note.getByRole("link", { name: "Privacy Policy" }),
		).toHaveAttribute(
			"href",
			"https://support.giphy.com/hc/en-us/articles/360032872931-GIPHY-Privacy-Policy",
		);
		await expect(gifSearchBox(page)).toHaveCount(0);
		await page.waitForTimeout(SEARCH_DEBOUNCE_MS * 2);
		const beforeAgree = await requests();
		expect(
			beforeAgree.length,
			"the chat itself went through the demo",
		).toBeGreaterThan(0);
		expect(giphyCalls(beforeAgree)).toEqual([]);
		await expect(gifTiles(page)).toHaveCount(0);

		await agreeButton(page).click();
		await expect(gifTiles(page)).toHaveCount(GIPHY_PAGE_SIZE);
		await expect(note).toHaveCount(0);
		await expect(gifSearchBox(page)).toBeVisible();
		expect(
			giphyCalls(await requests()).map(({ endpoint, query, offset }) => ({
				endpoint,
				query,
				offset,
			})),
		).toEqual([{ endpoint: "trending", query: null, offset: 0 }]);
		expect(await tileLabels(gifTiles(page))).toEqual(
			trendingLabels(GIPHY_PAGE_SIZE),
		);
		expect(realGiphy()).toEqual([]);
	});

	test("consent survives a reload and shows in Settings, where it can be revoked", async ({
		page,
	}) => {
		test.setTimeout(FIRST_ROUTE_COMPILE_MS);
		await openStickers(page, { giphyConsent: false });
		await agreeButton(page).click();
		await expect(gifTiles(page).first()).toBeVisible();
		await expect
			.poll(async () => (await storedPreferences(page))?.giphyConsent)
			.toBe(true);

		await page.reload();
		await openSheetFromComposer(page, { trigger: "GIFs and stickers" });
		await expect(gifTiles(page)).toHaveCount(GIPHY_PAGE_SIZE);
		await expect(page.locator(GIPHY_CONSENT_NOTE)).toHaveCount(0);

		await page.goto("/settings/app");
		await consentSwitch(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await expect(consentSwitch(page)).toBeChecked();
		await expect(consentSwitch(page)).toBeEnabled();
		const section = await consentSwitch(page).evaluate((control) =>
			[...document.querySelectorAll("h2")]
				.filter(
					(heading) =>
						(heading.compareDocumentPosition(control) &
							Node.DOCUMENT_POSITION_FOLLOWING) !==
						0,
				)
				.at(-1)
				?.textContent?.trim(),
		);
		expect(section).toBe("Privacy");

		await consentSwitch(page).click();
		await expect(consentSwitch(page)).not.toBeChecked();
		await expect
			.poll(async () => (await storedPreferences(page))?.giphyConsent)
			.toBe(false);

		await page.goto(DEMO_CONVERSATION);
		await openSheetFromComposer(page, { trigger: "GIFs and stickers" });
		await expect(page.locator(GIPHY_CONSENT_NOTE)).toBeVisible();
		await expect(gifTiles(page)).toHaveCount(0);
	});
});

test.describe("GIF search", () => {
	test("typing a new search drops the GIF picked from the old results", async ({
		page,
	}) => {
		await openStickers(page);
		await gifTiles(page).first().click();
		await expect(stickerSendButton(page)).toBeVisible();

		await gifSearchBox(page).fill("cats");

		await expect(page.locator(SELECTED_STICKER_TILE)).toHaveCount(0);
		await expect(stickerSendButton(page)).toHaveCount(0);
	});

	test("typing shows skeletons at once and searches once after the burst", async ({
		page,
	}) => {
		const requests = await recordDemoRequests(page);
		await openStickers(page);
		const timeline = await watchSearchTimeline(page);

		await gifSearchBox(page).pressSequentially("party", { delay: 30 });
		const firstResult = gifPanel(page).getByRole("button", {
			name: "Party GIF 1",
			exact: true,
		});
		await expect(firstResult).toBeVisible();
		await page.waitForTimeout(SEARCH_DEBOUNCE_MS + 200);

		const { inputs, skeletons } = await timeline();
		const searches = giphyCalls(await requests()).filter(
			({ endpoint }) => endpoint === "search",
		);
		expect(inputs).toHaveLength(5);
		expect(
			Math.max(
				...inputs.slice(1).map((at, index) => at - inputs[index]!),
			),
			"the keystrokes form one burst",
		).toBeLessThan(SEARCH_DEBOUNCE_MS);
		expect(
			searches.map(({ query, offset }) => ({ query, offset })),
		).toEqual([{ query: "party", offset: 0 }]);
		const [search] = searches;
		expect(
			skeletons[0]! - inputs[0]!,
			"skeletons follow the first key",
		).toBeLessThan(100);
		expect(skeletons[0]!).toBeLessThan(search!.at);
		expect(
			search!.at - inputs.at(-1)!,
			"the search waits out the debounce after the last key",
		).toBeGreaterThanOrEqual(SEARCH_DEBOUNCE_MS);

		await expect(gifTiles(page)).toHaveCount(GIPHY_PAGE_SIZE);
		const labels = await tileLabels(gifTiles(page));
		expect(labels.every((label) => label.startsWith("Party GIF "))).toBe(
			true,
		);
		await expect(
			gifPanel(page).getByRole("button", {
				name: demoTrendingLabel(0),
				exact: true,
			}),
		).toHaveCount(0);
	});

	test("Enter searches without waiting for the debounce", async ({
		page,
	}) => {
		const requests = await recordDemoRequests(page);
		await openStickers(page);
		const timeline = await watchSearchTimeline(page);

		await gifSearchBox(page).fill("wink");
		await gifSearchBox(page).press("Enter");
		await expect(
			gifPanel(page).getByRole("button", {
				name: "Wink GIF 1",
				exact: true,
			}),
		).toBeVisible();
		await expect(gifSearchBox(page)).not.toBeFocused();
		await page.waitForTimeout(SEARCH_DEBOUNCE_MS + 200);

		const { enters } = await timeline();
		const searches = giphyCalls(await requests()).filter(
			({ endpoint }) => endpoint === "search",
		);
		expect(searches.map(({ query }) => query)).toEqual(["wink"]);
		expect(enters).toHaveLength(1);
		expect(searches[0]!.at - enters[0]!).toBeLessThan(
			SEARCH_DEBOUNCE_MS / 2,
		);
	});

	test("a search with no results says so, and clearing it brings trending back", async ({
		page,
	}) => {
		const requests = await recordDemoRequests(page);
		await openStickers(page);

		await gifSearchBox(page).fill(DEMO_GIPHY_EMPTY_QUERY);
		await expect(gifPanel(page).getByText("No GIFs found")).toBeVisible();
		await expect(gifTiles(page)).toHaveCount(0);

		await page.getByRole("button", { name: "Clear search" }).click();
		await expect(gifSearchBox(page)).toHaveValue("");
		await expect(gifSearchBox(page)).toBeFocused();
		await expect(
			page.getByRole("button", { name: "Clear search" }),
		).toHaveCount(0);
		await expect(gifTiles(page)).toHaveCount(GIPHY_PAGE_SIZE);
		await expect(gifPanel(page).getByText("No GIFs found")).toHaveCount(0);
		expect(await tileLabels(gifTiles(page))).toEqual(
			trendingLabels(GIPHY_PAGE_SIZE),
		);
		expect(
			giphyCalls(await requests()).map(({ endpoint, query }) => ({
				endpoint,
				query,
			})),
		).toEqual([
			{ endpoint: "trending", query: null },
			{ endpoint: "search", query: DEMO_GIPHY_EMPTY_QUERY },
			{ endpoint: "trending", query: null },
		]);
	});

	test("a pasted GIPHY link shows just that GIF, unselected, without searching", async ({
		page,
	}) => {
		const requests = await recordDemoRequests(page);
		await openStickers(page);

		await gifSearchBox(page).fill(GIPHY_LINK);

		await expect(gifSearchBox(page)).toHaveValue(GIPHY_LINK);
		await expect(gifTiles(page)).toHaveCount(1);
		await expect(gifTiles(page)).toHaveAccessibleName(
			"GIF from a GIPHY link",
		);
		await expect(gifTiles(page)).toHaveAttribute("aria-pressed", "false");
		expect(
			giphyCalls(await requests()).map(({ endpoint }) => endpoint),
		).toEqual(["trending"]);
	});

	test("with reduced motion the GIF tiles show stills with a badge", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openStickers(page);
		const first = gifTiles(page).first();
		await expect(first.locator('[data-slot="gif-badge"]')).toBeVisible();

		await expect
			.poll(() =>
				gifTiles(page)
					.locator("img")
					.evaluateAll((images) =>
						(images as HTMLImageElement[]).some(
							(image) =>
								image.naturalHeight === 200 &&
								image.naturalWidth !== 200,
						),
					),
			)
			.toBe(true);
	});

	test("a link to a GIF GIPHY doesn't know says so", async ({ page }) => {
		await openStickers(page);

		await gifSearchBox(page).fill(
			`https://giphy.com/gifs/${DEMO_GIPHY_MISSING_ID}`,
		);

		await expect(gifPanel(page).getByText("No GIFs found")).toBeVisible();
		await expect(gifTiles(page)).toHaveCount(0);
	});

	test("touch: a slow drag down on the unfocused search box of the short sheet closes it", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openStickers(page);
		await page.waitForTimeout(600);
		const touch = await TrustedTouch.attach(page);
		const before = await box(page);
		const bar = (await page.locator(GIF_SEARCH_BAR).boundingBox())!;
		const from = { x: 195, y: bar.y + bar.height / 2 };

		await touch.drag(
			page,
			from,
			{ x: from.x, y: from.y + 240 },
			{ steps: 24, holdMs: 40, release: false },
		);
		expect(
			(await box(page)).top - before.top,
			"the sheet follows the finger",
		).toBeGreaterThan(200);

		await touch.end();
		await expect(page.locator(DRAWER)).toHaveCount(0);
	});

	test("focusing the search box expands the sheet", async ({ page }) => {
		await openStickers(page);
		const { full, short } = await snapTops(page);
		expect(Math.abs((await box(page)).top - short)).toBeLessThan(8);

		await gifSearchBox(page).focus();
		await expect
			.poll(async () => (await box(page)).top, { timeout: 5000 })
			.toBeLessThanOrEqual(full + 4);
	});
});

test.describe("GIF feed scrolling", () => {
	test("scrolling to the bottom loads the next page until trending runs out", async ({
		page,
	}) => {
		const requests = await recordDemoRequests(page);
		await openStickers(page, { stretchPanel: false });
		await expect(gifTiles(page)).toHaveCount(GIPHY_PAGE_SIZE);
		await expect(page.locator(GIF_PAGING_SENTINEL)).toHaveCount(1);
		await expandSheet(page);
		await page.waitForTimeout(500);
		await expect(gifTiles(page)).toHaveCount(GIPHY_PAGE_SIZE);

		for (const expected of [100, 150, DEMO_GIPHY_TRENDING_TOTAL]) {
			await scrollSheetTo(page, { top: "end" });
			await expect(gifTiles(page)).toHaveCount(expected);
		}
		await expect(page.locator(GIF_PAGING_SENTINEL)).toHaveCount(0);
		await scrollSheetBy(page, { pixels: -400 });
		await scrollSheetTo(page, { top: "end" });
		await page.waitForTimeout(800);

		await expect(gifTiles(page)).toHaveCount(DEMO_GIPHY_TRENDING_TOTAL);
		expect(await tileLabels(gifTiles(page))).toEqual(
			trendingLabels(DEMO_GIPHY_TRENDING_TOTAL),
		);
		expect(
			giphyCalls(await requests()).map(({ endpoint, offset }) => ({
				endpoint,
				offset,
			})),
		).toEqual(
			[0, 50, 100, 150].map((offset) => ({
				endpoint: "trending",
				offset,
			})),
		);
	});

	test("the search bar stays stuck to the top of the sheet", async ({
		page,
	}) => {
		await openStickers(page, { stretchPanel: false });
		await expandToFull(page);
		const { full } = await snapTops(page);
		const bar = page.locator(GIF_SEARCH_BAR);
		const resting = (await bar.boundingBox())!;
		expect(
			resting.y - full,
			"the bar starts below the handle",
		).toBeGreaterThan(8);

		await scrollSheetBy(page, { pixels: 600 });
		await page.waitForTimeout(300);
		const stuck = (await bar.boundingBox())!;
		expect(Math.abs(stuck.y - full)).toBeLessThanOrEqual(1);
		const firstTile = (await gifTiles(page).first().boundingBox())!;
		expect(
			firstTile.y + firstTile.height,
			"the first row scrolled under the bar",
		).toBeLessThan(stuck.y);

		const hit = await page.evaluate(
			({ x, y }) =>
				document
					.elementFromPoint(x, y)
					?.closest('[data-slot="gif-search-bar"]')
					?.getAttribute("data-slot") ?? null,
			{ x: stuck.x + 8, y: stuck.y + stuck.height - 4 },
		);
		expect(hit, "tiles pass under the bar, not over it").toBe(
			"gif-search-bar",
		);
	});
});

test.describe("GIF failures", () => {
	test("a failed first page offers Retry", async ({ page }) => {
		await failDemoRequests(page, {
			pathPrefix: GIPHY_TRENDING_PATH,
			times: 1,
			status: 503,
		});
		await openComposerSheet(page, {
			trigger: "GIFs and stickers",
			preferences: { giphyConsent: true },
		});

		const failure = gifPanel(page).locator(STICKER_ERROR);
		await expect(
			failure.getByText("Couldn't load GIFs", { exact: true }),
		).toBeVisible();
		await expect(gifTiles(page)).toHaveCount(0);

		await failure.getByRole("button", { name: "Retry" }).click();
		await expect(gifTiles(page)).toHaveCount(GIPHY_PAGE_SIZE);
		await expect(failure).toHaveCount(0);
	});

	test("a rate-limited next page keeps the first page and waits for Retry", async ({
		page,
	}) => {
		await failDemoRequests(page, {
			pathPrefix: giphyTrendingPageAt({ offset: GIPHY_PAGE_SIZE }),
			times: 1,
			status: GIPHY_RATE_LIMITED,
		});
		await openStickers(page, { stretchPanel: false });
		await expect(gifTiles(page)).toHaveCount(GIPHY_PAGE_SIZE);
		await expandSheet(page);
		await scrollSheetTo(page, { top: "end" });

		const failure = gifPanel(page).locator(STICKER_ERROR);
		const retry = failure.getByRole("button", { name: "Retry" });
		await expect(
			failure.getByText("Couldn't load more GIFs", { exact: true }),
		).toBeVisible();
		await expect(retry).toBeVisible();
		await page.waitForTimeout(FIRST_PAGING_AUTO_RETRY_MS + 500);
		await expect(
			retry,
			"a rate limit is not retried on its own",
		).toBeVisible();
		await expect(gifTiles(page)).toHaveCount(GIPHY_PAGE_SIZE);
		expect(await tileLabels(gifTiles(page))).toEqual(
			trendingLabels(GIPHY_PAGE_SIZE),
		);

		await retry.click();
		await expect(gifTiles(page)).toHaveCount(GIPHY_PAGE_SIZE * 2);
		await expect(failure).toHaveCount(0);
		expect(await tileLabels(gifTiles(page))).toEqual(
			trendingLabels(GIPHY_PAGE_SIZE * 2),
		);
	});
});

test("the GIF tab credits GIPHY with its official mark", async ({ page }) => {
	await openStickers(page);

	const mark = page.getByRole("img", { name: "Powered by GIPHY" });
	await expect(mark).toBeVisible();
	await expect(mark).toHaveJSProperty("complete", true);
	expect(
		await mark.evaluate((image: HTMLImageElement) => image.naturalWidth),
	).toBeGreaterThan(0);
});

test.describe("GIF tab spacing", () => {
	function creditGap(page: Page): Promise<number> {
		return gifTiles(page)
			.first()
			.evaluate((tile) => {
				const drawer = tile.closest("[data-vaul-drawer]")!;
				const credit = drawer
					.querySelector('[data-slot="gif-attribution"]')!
					.getBoundingClientRect();
				const tabs = drawer
					.querySelector('[data-slot="tabs-list"]')!
					.getBoundingClientRect();
				return credit.left - tabs.right;
			});
	}

	function tabsOffCenter(page: Page): Promise<number> {
		return gifTiles(page)
			.first()
			.evaluate((tile) => {
				const drawer = tile.closest("[data-vaul-drawer]")!;
				const bar = drawer
					.querySelector('[data-slot="media-sheet-tab-bar"]')!
					.getBoundingClientRect();
				const tabs = drawer
					.querySelector('[data-slot="tabs-list"]')!
					.getBoundingClientRect();
				return Math.abs(
					tabs.left + tabs.width / 2 - (bar.left + bar.width / 2),
				);
			});
	}

	function firstRowGap(page: Page): Promise<number> {
		return gifTiles(page)
			.first()
			.evaluate((tile) => {
				const bar = tile
					.closest("[data-vaul-drawer]")!
					.querySelector('[data-slot="gif-search-bar"]')!
					.getBoundingClientRect();
				return tile.getBoundingClientRect().top - bar.bottom;
			});
	}

	for (const width of [320, 360, 384]) {
		test(`at ${width} px the GIPHY credit clears the centered tabs`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 800 });
			await openStickers(page);
			await expect(gifTiles(page).first()).toBeVisible();

			expect(await creditGap(page)).toBeGreaterThanOrEqual(8);
			expect(await tabsOffCenter(page)).toBeLessThanOrEqual(1);
		});

		test(`at ${width} px the first row clears the search hairline`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 800 });
			await openStickers(page);
			await expect(gifTiles(page).first()).toBeVisible();

			expect(await firstRowGap(page)).toBeGreaterThanOrEqual(8);
		});
	}
});
