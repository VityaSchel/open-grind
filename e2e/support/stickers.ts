import { expect, type Locator, type Page } from "@playwright/test";

import type { DemoRequest } from "./demo-faults";
import { DRAWER, openComposerSheet } from "./drawer";

export const STICKER_TILE = '[data-slot="sticker-tile"]';
export const SELECTED_STICKER_TILE = `${STICKER_TILE}[aria-pressed="true"]`;
export const STICKER_GRID_SKELETON = '[data-slot="sticker-grid-skeleton"]';
export const GAYMOJI_TAB = '[data-slot="gaymoji-tab"]';
export const GIF_SEARCH_BAR = '[data-slot="gif-search-bar"]';
export const GIPHY_CONSENT_NOTE = '[data-slot="giphy-consent-note"]';
export const GIPHY_MESSAGE = '[data-slot="giphy-message"]';
export const TRANSPARENT_PIXEL =
	"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const DEMO_GIPHY_TRENDING_TOTAL = 172;
export const DEMO_GIPHY_EMPTY_QUERY = "zzzz";
export const DEMO_GIPHY_MISSING_ID = "NoSuchDemoGif";
export const DEMO_GAYMOJI_TILE_COUNT = 518;
export const GIPHY_PAGE_SIZE = 50;
const DEMO_TRENDING_PHRASES = [
	"Hello",
	"Thank You",
	"Love You",
	"Dance",
	"Wink",
	"Yes",
	"No Way",
	"Laughing",
	"Party",
	"Hug",
	"Wow",
	"Bye",
	"Excited",
	"Good Morning",
	"Eye Roll",
	"Facepalm",
];
const GIPHY_API_PREFIX = "api.giphy.com/v1/gifs/";
export const GIPHY_TRENDING_PATH = `${GIPHY_API_PREFIX}trending`;
export const GAYMOJI_MANIFEST_PATH = "cdns.grindr.com/grindr/chat/gaymoji";
const REAL_GIPHY_HOSTS = /^https?:\/\/(?:[a-z0-9-]+\.)*giphy\.com(?:[:/]|$)/;

export function demoTrendingLabel(index: number): string {
	return `${DEMO_TRENDING_PHRASES[index % DEMO_TRENDING_PHRASES.length]} GIF`;
}

export function giphyTrendingPageAt({ offset }: { offset: number }): string {
	return `${GIPHY_TRENDING_PATH}?limit=${GIPHY_PAGE_SIZE}&rating=r&offset=${offset}&`;
}

type StickersSheetOptions = { giphyConsent?: boolean; stretchPanel?: boolean };

export async function openStickers(
	page: Page,
	{ giphyConsent = true, stretchPanel = true }: StickersSheetOptions = {},
): Promise<void> {
	await openComposerSheet(page, {
		trigger: "GIFs and stickers",
		preferences: { giphyConsent },
		stretchPanel,
	});
	if (giphyConsent) await expect(gifTiles(page).first()).toBeVisible();
}

export async function openGaymoji(
	page: Page,
	options: StickersSheetOptions = {},
): Promise<void> {
	await openStickers(page, options);
	await showGaymojiTab(page);
}

export async function showGaymojiTab(page: Page): Promise<void> {
	await stickersTab(page, { name: "Gaymoji" }).click();
	await expect(gaymojiTiles(page).first()).toBeVisible();
}

export async function sendGif(page: Page): Promise<void> {
	await openStickers(page);
	await gifTiles(page).nth(1).click();
	await stickerSendButton(page).click();
}

export function stickersTab(
	page: Page,
	{ name }: { name: "GIFs" | "Gaymoji" },
): Locator {
	return page.locator(DRAWER).getByRole("tab", { name });
}

export function gifPanel(page: Page): Locator {
	return page.getByRole("tabpanel", { name: "GIFs" });
}

export function gaymojiPanel(page: Page): Locator {
	return page.getByRole("tabpanel", { name: "Gaymoji" });
}

export function gifTiles(page: Page): Locator {
	return gifPanel(page).locator(STICKER_TILE);
}

export function gaymojiTiles(page: Page): Locator {
	return gaymojiPanel(page).locator(STICKER_TILE);
}

export function gaymojiSectionStrip(page: Page): Locator {
	return gaymojiPanel(page).getByRole("navigation", {
		name: "Gaymoji categories",
	});
}

export function gaymojiRegion(
	page: Page,
	{ title }: { title: string },
): Locator {
	return gaymojiPanel(page).getByRole("region", { name: title });
}

export type TileChurn = { added: number; removed: number };

declare global {
	interface Window {
		__gaymojiTileChurn?: TileChurn;
	}
}

export async function countGaymojiTileChurn(
	page: Page,
): Promise<{ read: () => Promise<TileChurn>; reset: () => Promise<void> }> {
	await page.addInitScript(
		({ tile, tab }) => {
			const seen = new WeakSet<Element>();
			const churn: TileChurn = { added: 0, removed: 0 };
			window.__gaymojiTileChurn = churn;
			const tilesIn = (node: Node): Element[] => {
				if (!(node instanceof Element)) return [];
				return node.matches(tile)
					? [node]
					: [...node.querySelectorAll(tile)];
			};
			new MutationObserver((records) => {
				for (const { target, addedNodes, removedNodes } of records) {
					const inTab =
						target instanceof Element &&
						(target.closest(tab) !== null ||
							target.querySelector(tab) !== null);
					if (!inTab) continue;
					for (const node of addedNodes) {
						for (const element of tilesIn(node)) {
							if (seen.has(element)) continue;
							seen.add(element);
							churn.added += 1;
						}
					}
					for (const node of removedNodes)
						churn.removed += tilesIn(node).length;
				}
			}).observe(document, { childList: true, subtree: true });
		},
		{ tile: STICKER_TILE, tab: GAYMOJI_TAB },
	);
	return {
		read: () => page.evaluate(() => ({ ...window.__gaymojiTileChurn! })),
		reset: () =>
			page.evaluate(() => {
				Object.assign(window.__gaymojiTileChurn!, {
					added: 0,
					removed: 0,
				});
			}),
	};
}

export function gifSearchBox(page: Page): Locator {
	return page.getByRole("searchbox", {
		name: "Search GIFs or paste GIPHY link",
	});
}

export function stickerSendButton(page: Page): Locator {
	return page.locator(DRAWER).getByRole("button", { name: /^Send / });
}

export function tileLabels(tiles: Locator): Promise<string[]> {
	return tiles.evaluateAll((elements) =>
		elements.map((element) => element.getAttribute("aria-label") ?? ""),
	);
}

export function visibleColumns(page: Page): Promise<number> {
	return page.evaluate((tile) => {
		const lefts = [...document.querySelectorAll<HTMLElement>(tile)]
			.filter((element) => element.checkVisibility())
			.slice(0, 24)
			.map((element) => Math.round(element.getBoundingClientRect().left));
		return new Set(lefts).size;
	}, STICKER_TILE);
}

export function visibleTileAspectRatios(page: Page): Promise<number[]> {
	return page.evaluate((tile) => {
		return [...document.querySelectorAll<HTMLElement>(tile)]
			.filter((element) => element.checkVisibility())
			.slice(0, 12)
			.map((element) => {
				const { width, height } = element.getBoundingClientRect();
				return width / height;
			});
	}, STICKER_TILE);
}

export type GiphyCall = {
	endpoint: string;
	query: string | null;
	offset: number;
	at: number;
};

export function giphyCalls(requests: DemoRequest[]): GiphyCall[] {
	return requests
		.filter(({ path }) => path.startsWith(GIPHY_API_PREFIX))
		.map(({ path, at }) => {
			const url = new URL(`https://${path}`);
			return {
				endpoint: url.pathname.slice("/v1/gifs/".length),
				query: url.searchParams.get("q"),
				offset: Number(url.searchParams.get("offset") ?? 0),
				at,
			};
		});
}

export function gaymojiManifestCalls(requests: DemoRequest[]): DemoRequest[] {
	return requests.filter(({ path }) => path === GAYMOJI_MANIFEST_PATH);
}

export async function refuseRealGiphy(
	page: Page,
): Promise<() => readonly string[]> {
	const attempted: string[] = [];
	await page.route(REAL_GIPHY_HOSTS, async (route) => {
		attempted.push(route.request().url());
		await route.abort();
	});
	return () => attempted;
}
