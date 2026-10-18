import type { Page } from "@playwright/test";

import type { Scene } from ".";
import {
	drop,
	type DroppedFile,
	droppedFiles,
	openConversation,
} from "./media-drop";
import { addingToast } from "./toast";

const SEND_PREVIEWS = '[data-slot="send-media-previews"]';

async function dropToSend({
	page,
	photos = 0,
	videos = 0,
}: {
	page: Page;
	photos?: number;
	videos?: number;
}): Promise<void> {
	const shown = await page.locator(`${SEND_PREVIEWS} > *`).count();
	await drop({ page, files: await droppedFiles({ photos, videos }) });
	const previews = page.locator(`${SEND_PREVIEWS} > *`);
	await previews.nth(shown + photos + videos - 1).waitFor();
	await page
		.locator(SEND_PREVIEWS)
		.locator('[data-slot="skeleton"]')
		.waitFor({ state: "detached" });
}

export const sendPhotos: Scene = {
	platform: "phone",
	views: [
		{
			id: "chat/composer/send-photo",
			screen: "chat/conversation",
			drive: async (page) => {
				await openConversation(page);
				await dropToSend({ page, photos: 1 });
			},
		},
		{
			id: "chat/composer/send-photos",
			screen: "chat/conversation",
			drive: (page) => dropToSend({ page, photos: 1 }),
		},
		{
			id: "chat/composer/send-photos-and-video",
			screen: "chat/conversation",
			drive: (page) => dropToSend({ page, videos: 1 }),
		},
	],
};

export const sendVideos: Scene = {
	platform: "phone",
	views: [
		{
			id: "chat/composer/send-video",
			screen: "chat/conversation",
			drive: async (page) => {
				await openConversation(page);
				await dropToSend({ page, videos: 1 });
			},
		},
		{
			id: "chat/composer/send-videos",
			screen: "chat/conversation",
			drive: (page) => dropToSend({ page, videos: 1 }),
		},
	],
};

const BROKEN_PHOTO: DroppedFile = {
	name: "broken.png",
	mimeType: "image/png",
	base64: "AAAAAAAA",
};

export const sendPreviewFailure: Scene = {
	platform: "phone",
	views: [
		{
			id: "chat/composer/send-preview-failed",
			screen: "chat/conversation",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openConversation(page);
				await addingToast({
					page,
					action: () => drop({ page, files: [BROKEN_PHOTO] }),
				});
				await page
					.locator(SEND_PREVIEWS)
					.waitFor({ state: "detached" });
			},
		},
	],
};
