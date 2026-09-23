import { type Page } from "@playwright/test";

import { backLink, installTauriShim } from "./app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./media";
import { stackSettled } from "./page-stack";

export const ALBUM_TILE = '[data-slot="album-tile"]';
export const MEDIA_SLOT = '[data-slot="media-slot"]';
export const MEDIA_SLOT_CELL = '[data-slot="media-slot-cell"]';
export const SHARED_ALBUM_ID = 903;
export const SHARED_ALBUM = `a[data-slot="album-tile"][href="/settings/albums/${SHARED_ALBUM_ID}"]`;
export const TWO_ROW_ALBUM_ID = 902;
export const TWO_ROW_ALBUM = `a[data-slot="album-tile"][href="/settings/albums/${TWO_ROW_ALBUM_ID}"]`;

export function albumTileNamed(name: string): string {
	return `a[data-slot="album-tile"]:has-text("${name}")`;
}

export async function openAlbums(page: Page): Promise<void> {
	await installTauriShim(page);
	await serveImages(page, CHAT_MEDIA_HOST);
	await serveImages(page, AVATAR_HOST);
	await page.goto("/settings/albums");
	await page.locator(ALBUM_TILE).first().waitFor({ timeout: 60_000 });
}

export async function openAlbum(page: Page, tile: string): Promise<void> {
	await openAlbums(page);
	await page.locator(tile).click();
	await page.locator(MEDIA_SLOT).first().waitFor({ timeout: 30_000 });
	await stackSettled(page);
	await page.waitForTimeout(500);
}

export function openSharedAlbum(page: Page): Promise<void> {
	return openAlbum(page, SHARED_ALBUM);
}

export function back(page: Page): Promise<void> {
	return backLink(page).click();
}
