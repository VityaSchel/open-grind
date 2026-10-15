import type { Locator, Page } from "@playwright/test";

import {
	DRAWER,
	LIFTED_MEDIA_TILE,
	MEDIA_TILE,
} from "../../../e2e/support/drawer";
import type { Scene } from ".";
import { openAttachments } from "./chat-composer";
import { ALERT, changeScene, chooseGeneratedMedia } from "./drive";
import { CONNECT_FAILED } from "./faults";
import { addingToast } from "./toast";

const UPLOAD_LABEL = "Upload photos or videos";
const VIDEO_TILE = `${MEDIA_TILE}[aria-label]`;
const PHOTO_TILE = `${MEDIA_TILE}:not([aria-label])`;

function videoTile(page: Page): Locator {
	return page.locator(DRAWER).locator(VIDEO_TILE).first();
}

function photoTile(page: Page): Locator {
	return page.locator(DRAWER).locator(PHOTO_TILE).first();
}

async function openTileMenu(tile: Locator): Promise<void> {
	await tile.click({ button: "right" });
	await tile.page().locator(LIFTED_MEDIA_TILE).waitFor();
	await tile.page().getByRole("menu").waitFor();
}

async function deletePermanently(page: Page): Promise<void> {
	await page.getByRole("menuitem", { name: "Delete permanently" }).click();
	await page.locator(ALERT).waitFor();
}

async function cancelDelete(page: Page): Promise<void> {
	await page.locator(ALERT).getByRole("button", { name: "Cancel" }).click();
	await page.locator(ALERT).waitFor({ state: "detached" });
}

function confirmDelete(page: Page): Promise<void> {
	return addingToast({
		page,
		action: () =>
			page.locator(ALERT).getByRole("button", { name: "Delete" }).click(),
	});
}

export const drawerTileMenus: Scene = {
	platform: "phone",
	views: [
		{
			id: "chat/attachments/video-tile",
			screen: "chat/conversation",
			drive: async (page) => {
				await openAttachments(page);
				await chooseGeneratedMedia({
					page,
					photos: 0,
					videos: 1,
					open: () =>
						page
							.getByRole("button", { name: UPLOAD_LABEL })
							.first()
							.click(),
				});
				await videoTile(page).waitFor();
			},
		},
		{
			id: "chat/attachments/video-menu",
			screen: "chat/conversation",
			drive: (page) => openTileMenu(videoTile(page)),
		},
		{
			id: "chat/attachments/delete-video",
			screen: "chat/conversation",
			drive: deletePermanently,
		},
		{
			id: "chat/attachments/photo-menu",
			screen: "chat/conversation",
			drive: async (page) => {
				await cancelDelete(page);
				await openTileMenu(photoTile(page));
			},
		},
		{
			id: "chat/attachments/delete-photo",
			screen: "chat/conversation",
			drive: deletePermanently,
		},
		{
			id: "chat/attachments/delete-failures",
			screen: "chat/conversation",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await changeScene({
					page,
					scene: {
						restFaults: [
							{
								method: "DELETE",
								path: {
									pattern: "^/v4/chat/media/drawer/\\d+$",
								},
								error: CONNECT_FAILED,
							},
						],
					},
				});
				await confirmDelete(page);
				await openTileMenu(videoTile(page));
				await deletePermanently(page);
				await confirmDelete(page);
			},
		},
	],
};
