import type { JSHandle, Page } from "@playwright/test";

import { MESSAGE_ROW } from "../../../e2e/support/app";
import { generatedPhotos, generatedVideos } from "../images";
import type { Scene } from ".";
import { openAlbum } from "./album-drive";
import { TEXT_CONVERSATION } from "./chat";
import { failRandomUuids } from "./chat-drive";
import { openProfileEdit } from "./settings-profile";
import { SHOWN_TOAST, toastsShown } from "./toast";
import { visit } from "./visit";

const DROP_ZONE = '[data-slot="media-drop-zone"]';
const DRAG_REPEAT_MS = 250;
const PHOTO_ALBUM_ID = 900;
const INSECURE_IMAGE = '<img src="http://localhost/dragged.png">';

export type DroppedFile = { name: string; mimeType: string; base64: string };

export async function droppedFiles({
	photos = 0,
	videos = 0,
	other = 0,
}: {
	photos?: number;
	videos?: number;
	other?: number;
}): Promise<DroppedFile[]> {
	const generated = [
		...(await generatedPhotos(photos)),
		...(await generatedVideos(videos)),
	].map(({ name, mimeType, buffer }) => ({
		name,
		mimeType,
		base64: buffer.toString("base64"),
	}));
	const notes = Array.from({ length: other }, (_, index) => ({
		name: `notes-${index + 1}.txt`,
		mimeType: "text/plain",
		base64: Buffer.from("Lorem ipsum dolor sit amet.").toString("base64"),
	}));
	return [...generated, ...notes];
}

function transferOf({
	page,
	files,
	markup,
}: {
	page: Page;
	files: DroppedFile[];
	markup?: string;
}): Promise<JSHandle<DataTransfer>> {
	return page.evaluateHandle(
		({ dropped, html }) => {
			const transfer = new DataTransfer();
			for (const { name, mimeType, base64 } of dropped) {
				const bytes = Uint8Array.from(atob(base64), (char) =>
					char.charCodeAt(0),
				);
				transfer.items.add(new File([bytes], name, { type: mimeType }));
			}
			if (html !== null) transfer.setData("text/html", html);
			return transfer;
		},
		{ dropped: files, html: markup ?? null },
	);
}

async function holdDrag({
	page,
	files,
}: {
	page: Page;
	files: DroppedFile[];
}): Promise<void> {
	const dataTransfer = await transferOf({ page, files });
	await page.dispatchEvent("body", "dragenter", { dataTransfer });
	await dataTransfer.evaluate((transfer, repeatMs) => {
		setInterval(() => {
			document.body.dispatchEvent(
				new DragEvent("dragover", {
					dataTransfer: transfer,
					bubbles: true,
					cancelable: true,
				}),
			);
		}, repeatMs);
	}, DRAG_REPEAT_MS);
	await page.locator(DROP_ZONE).waitFor();
}

export async function drop({
	page,
	files = [],
	markup,
}: {
	page: Page;
	files?: DroppedFile[];
	markup?: string;
}): Promise<void> {
	const dataTransfer = await transferOf({ page, files, markup });
	for (const type of ["dragenter", "dragover", "drop"]) {
		await page.dispatchEvent("body", type, { dataTransfer });
	}
}

export function openConversation(page: Page): Promise<void> {
	return visit({
		page,
		path: TEXT_CONVERSATION,
		ready: page.locator(MESSAGE_ROW),
	});
}

function openNewAlbum(page: Page): Promise<void> {
	return visit({
		page,
		path: "/settings/albums/new",
		ready: page.getByText("Add a photo to start your album"),
	});
}

function dragView({
	id,
	open,
	files,
}: {
	id: string;
	open: (page: Page) => Promise<void>;
	files: () => Promise<DroppedFile[]>;
}): Scene {
	return {
		platform: "phone",
		views: [
			{
				id,
				drive: async (page) => {
					await open(page);
					await holdDrag({ page, files: await files() });
				},
			},
		],
	};
}

export const chatDropTarget = dragView({
	id: "chat/conversation/drop",
	open: openConversation,
	files: () => droppedFiles({ photos: 1 }),
});

export const albumDropTarget = dragView({
	id: "settings/albums/album/drop",
	open: (page) => openAlbum({ page, albumId: PHOTO_ALBUM_ID }),
	files: () => droppedFiles({ photos: 1 }),
});

export const newAlbumDropTarget = dragView({
	id: "settings/albums/new/drop",
	open: openNewAlbum,
	files: () => droppedFiles({ photos: 1 }),
});

export const profilePhotosDropTarget = dragView({
	id: "settings/profile/photos/drop",
	open: openProfileEdit,
	files: () => droppedFiles({ photos: 1 }),
});

export const unsupportedDrag = dragView({
	id: "chat/conversation/drop-unsupported",
	open: openConversation,
	files: () => droppedFiles({ other: 1 }),
});

export const videoDragOnPhotos = dragView({
	id: "settings/profile/photos/drop-video",
	open: openProfileEdit,
	files: () => droppedFiles({ videos: 1 }),
});

export const profilePhotoDropRefusals: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/profile/photos/drop-refusals",
			screen: "settings/profile",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openProfileEdit(page);
				await drop({
					page,
					files: await droppedFiles({ videos: 1, other: 1 }),
				});
				await toastsShown({ page, count: 2 });
			},
		},
	],
};

export const chatDropFailures: Scene = {
	platform: "phone",
	views: [
		{
			id: "chat/conversation/drop-failures",
			screen: "chat/conversation",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openConversation(page);
				await drop({ page, markup: INSECURE_IMAGE });
				await failRandomUuids(page);
				await drop({ page, files: await droppedFiles({ photos: 1 }) });
				await toastsShown({ page, count: 2 });
			},
		},
	],
};

const LINKED_IMAGE = '<img src="https://localhost/dragged.png">';

function linkRefusal(reason: string) {
	return { reject: { kind: "Media", message: { reason } } };
}

export const chatLinkRefusals: Scene = {
	platform: "phone",
	native: {
		stage_linked_media: {
			sequence: [
				linkRefusal("linkNotMedia"),
				linkRefusal("linkTooLarge"),
			],
		},
	},
	views: [
		{
			id: "chat/conversation/link-refusals",
			screen: "chat/conversation",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openConversation(page);
				await drop({ page, markup: LINKED_IMAGE });
				await page.locator(SHOWN_TOAST).first().waitFor();
				await drop({ page, markup: LINKED_IMAGE });
				await toastsShown({ page, count: 2 });
			},
		},
	],
};
