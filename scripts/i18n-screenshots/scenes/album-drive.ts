import type { Locator, Page } from "@playwright/test";

import { DRAWER, MEDIA_TILE } from "../../../e2e/support/drawer";
import { chooseGeneratedMedia } from "./drive";
import { addingToast } from "./toast";
import { visit } from "./visit";

export const SUBPAGE_SCROLLER = '[data-slot="subpage-scroller"]';
export const MEDIA_SLOT = '[data-slot="media-slot"]';
const ADD_TILE = '[data-slot="add-tile"]';
const RECONCILE_INTERVAL_MS = 5_000;

export function albumPath(albumId: number): string {
	return `/settings/albums/${albumId}`;
}

export function albumMenu(page: Page): Locator {
	return page.getByRole("button", { name: "Album menu" });
}

export function openAlbum({
	page,
	albumId,
}: {
	page: Page;
	albumId: number;
}): Promise<void> {
	return visit({ page, path: albumPath(albumId), ready: albumMenu(page) });
}

export function sheet(page: Page): Locator {
	return page.locator(DRAWER);
}

export async function openPreviousUploads(page: Page): Promise<void> {
	await page
		.getByRole("button", { name: "Add photos or videos" })
		.first()
		.click();
	await sheet(page).getByText("Previous Uploads").first().waitFor();
}

export async function closeSheet(page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await sheet(page).waitFor({ state: "detached" });
}

export function sheetTiles(page: Page): Locator {
	return sheet(page).locator(MEDIA_TILE);
}

export function uploadToAlbum({
	page,
	photos,
	videos,
}: {
	page: Page;
	photos: number;
	videos: number;
}): Promise<void> {
	return chooseGeneratedMedia({
		page,
		photos,
		videos,
		open: async () => {
			await openPreviousUploads(page);
			await sheet(page).locator(ADD_TILE).click();
		},
	});
}

export function slotButton({
	page,
	name,
}: {
	page: Page;
	name: string;
}): Locator {
	return page.locator(MEDIA_SLOT).getByRole("button", { name });
}

export function saveChanges(page: Page): Promise<void> {
	return addingToast({
		page,
		action: () =>
			page.getByRole("button", { name: "Save changes" }).click(),
	});
}

export async function skipReconcileWaits(page: Page): Promise<void> {
	await page.evaluate((interval) => {
		const wait = window.setTimeout;
		window.setTimeout = ((
			handler: TimerHandler,
			timeout?: number,
			...args: unknown[]
		) =>
			wait(
				handler,
				timeout === interval ? 0 : timeout,
				...args,
			)) as typeof setTimeout;
	}, RECONCILE_INTERVAL_MS);
}
