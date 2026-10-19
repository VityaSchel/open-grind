import type { Locator, Page } from "@playwright/test";

import { MESSAGE_ROW } from "../../../e2e/support/app";
import {
	DRAWER,
	expandSheet,
	scrollSheetTo,
} from "../../../e2e/support/drawer";
import {
	DEMO_GIPHY_EMPTY_QUERY,
	GAYMOJI_MANIFEST_PATH,
	GIPHY_CONSENT_NOTE,
	GIPHY_MESSAGE,
	GIPHY_PAGE_SIZE,
	GIPHY_TRENDING_PATH,
	gaymojiSectionStrip,
	gaymojiTiles,
	gifSearchBox,
	gifTiles,
	stickersTab,
} from "../../../e2e/support/stickers";
import type { RestFault } from "../../../src/lib/demo/screenshot-scene";
import { showsLoading } from "../settle";
import { overrideNative } from "../stubs";
import type { Scene } from ".";
import { TEXT_CONVERSATION } from "./chat";
import { openConversation } from "./chat-drive";
import { GIF_ID, GIF_INBOX } from "./chat-fixtures";
import { ALERT } from "./drive";
import { CONNECT_FAILED, STORAGE_FULL } from "./faults";
import { addingToast } from "./toast";
import { visit } from "./visit";

const STICKERS_TRIGGER = "GIFs and stickers";
const STICKER_ERROR = '[data-slot="sticker-error"]';
const SEND_STICKER = '[data-slot="sheet-actions"] button';
const LINKED_GIF = "https://giphy.com/gifs/DemoLinkedGif";
const CONVERSATION_SCREEN = "chat/conversation";
const GIF_THREAD_SCREEN = "chat/conversation/gif";

const secondTrendingPage: Pick<RestFault, "method" | "path"> = {
	method: "GET",
	path: {
		pattern: `^${GIPHY_TRENDING_PATH.replaceAll(".", "\\.")}\\?.*offset=${GIPHY_PAGE_SIZE}&`,
	},
};

async function openStickers(page: Page): Promise<void> {
	await visit({
		page,
		path: TEXT_CONVERSATION,
		ready: page.locator(MESSAGE_ROW),
	});
	await page.getByRole("button", { name: STICKERS_TRIGGER }).click();
	await page.locator(DRAWER).waitFor();
}

async function enableGiphy(page: Page): Promise<void> {
	await page
		.locator(GIPHY_CONSENT_NOTE)
		.getByRole("button", { name: "Continue" })
		.click();
}

async function showTrending(page: Page): Promise<void> {
	await openStickers(page);
	await enableGiphy(page);
	await gifTiles(page).first().waitFor();
}

async function searchGifs({
	page,
	query,
}: {
	page: Page;
	query: string;
}): Promise<void> {
	await gifSearchBox(page).fill(query);
	await gifSearchBox(page).press("Enter");
}

async function scrollGifsToEnd(page: Page): Promise<void> {
	await expandSheet(page);
	await scrollSheetTo(page, { top: "end" });
}

function stickerError(page: Page): Locator {
	return page.locator(DRAWER).locator(STICKER_ERROR);
}

export const stickers: Scene = {
	platform: "phone",
	views: [
		{
			id: "chat/stickers/consent",
			screen: CONVERSATION_SCREEN,
			drive: async (page) => {
				await openStickers(page);
				await page.locator(GIPHY_CONSENT_NOTE).waitFor();
			},
		},
		{
			id: "chat/stickers/gifs",
			screen: CONVERSATION_SCREEN,
			drive: async (page) => {
				await enableGiphy(page);
				await gifTiles(page).first().waitFor();
			},
		},
		{
			id: "chat/stickers/gif-picked",
			screen: CONVERSATION_SCREEN,
			drive: async (page) => {
				await gifTiles(page).first().click();
				await page.locator(DRAWER).locator(SEND_STICKER).waitFor();
			},
		},
		{
			id: "chat/stickers/gifs-empty",
			screen: CONVERSATION_SCREEN,
			drive: async (page) => {
				await searchGifs({ page, query: DEMO_GIPHY_EMPTY_QUERY });
				await page.locator(DRAWER).getByText("No GIFs Found").waitFor();
			},
		},
		{
			id: "chat/stickers/gif-link",
			screen: CONVERSATION_SCREEN,
			drive: async (page) => {
				await searchGifs({ page, query: LINKED_GIF });
				await page
					.getByRole("button", { name: "GIF from a GIPHY link" })
					.waitFor();
			},
		},
		{
			id: "chat/stickers/gaymoji",
			screen: CONVERSATION_SCREEN,
			drive: async (page) => {
				await stickersTab(page, { name: "Gaymoji" }).click();
				await gaymojiSectionStrip(page).waitFor();
				await gaymojiTiles(page).first().waitFor();
			},
		},
		{
			id: "chat/stickers/gaymoji-picked",
			screen: CONVERSATION_SCREEN,
			drive: async (page) => {
				await gaymojiTiles(page).first().click();
				await page.locator(DRAWER).locator(SEND_STICKER).waitFor();
			},
		},
	],
};

export const stickerLoadFailures: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			{ method: "GET", path: GIPHY_TRENDING_PATH, error: CONNECT_FAILED },
			{
				method: "GET",
				path: GAYMOJI_MANIFEST_PATH,
				error: CONNECT_FAILED,
			},
		],
	},
	views: [
		{
			id: "chat/stickers/gifs-failed",
			screen: CONVERSATION_SCREEN,
			drive: async (page) => {
				await openStickers(page);
				await enableGiphy(page);
				await stickerError(page).waitFor();
			},
		},
		{
			id: "chat/stickers/gaymoji-failed",
			screen: CONVERSATION_SCREEN,
			drive: async (page) => {
				await stickersTab(page, { name: "Gaymoji" }).click();
				await page
					.locator(DRAWER)
					.getByText("Couldn’t load Gaymoji")
					.waitFor();
			},
		},
	],
};

export const gifsLoadingMore: Scene = {
	platform: "phone",
	demo: { restFaults: [{ ...secondTrendingPage, pending: true }] },
	views: [
		{
			id: "chat/stickers/gifs-loading-more",
			screen: CONVERSATION_SCREEN,
			drive: async (page) => {
				showsLoading(page);
				await showTrending(page);
				await scrollGifsToEnd(page);
				await page
					.locator(DRAWER)
					.getByRole("status")
					.getByText("Loading more GIFs")
					.waitFor({ state: "attached" });
			},
		},
	],
};

export const gifsLoadMoreFailure: Scene = {
	platform: "phone",
	demo: { restFaults: [{ ...secondTrendingPage, error: CONNECT_FAILED }] },
	views: [
		{
			id: "chat/stickers/gifs-load-more-failed",
			screen: CONVERSATION_SCREEN,
			drive: async (page) => {
				await showTrending(page);
				await scrollGifsToEnd(page);
				await stickerError(page).waitFor();
			},
		},
	],
};

function receivedGif(page: Page): Locator {
	return page.locator(GIPHY_MESSAGE).first();
}

export const giphyConsentInChat: Scene = {
	platform: "phone",
	demo: { inbox: GIF_INBOX },
	views: [
		{
			id: GIF_THREAD_SCREEN,
			drive: async (page) => {
				await openConversation({ page, withId: GIF_ID });
				await receivedGif(page).waitFor();
			},
		},
		{
			id: "chat/conversation/gif-consent",
			screen: GIF_THREAD_SCREEN,
			drive: async (page) => {
				await receivedGif(page).getByRole("button").click();
				await page.locator(ALERT).waitFor();
			},
		},
		{
			id: "chat/conversation/gif-consent-failed",
			screen: GIF_THREAD_SCREEN,
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await overrideNative({
					page,
					overrides: { write_app_data: { reject: STORAGE_FULL } },
				});
				await addingToast({
					page,
					action: () =>
						page
							.locator(ALERT)
							.getByRole("button", { name: "Continue" })
							.click(),
				});
			},
		},
	],
};
