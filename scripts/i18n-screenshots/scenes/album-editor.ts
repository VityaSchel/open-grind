import type { Page } from "@playwright/test";

import type { RestFault } from "../../../src/lib/demo/screenshot-scene";
import type { Scene } from ".";
import {
	albumMenu,
	closeSheet,
	openAlbum,
	openPreviousUploads,
	saveChanges,
	sheet,
	sheetTiles,
	slotButton,
	SUBPAGE_SCROLLER,
} from "./album-drive";
import { albumAnswer, albumContentId, type AlbumSlot } from "./album-fixtures";
import { ALERT, changeScene, chooseGeneratedMedia } from "./drive";
import { failing } from "./faults";
import { addingToast } from "./toast";
import { visit } from "./visit";

const MY_ALBUM_ID = 900;
const SHARED_ALBUM_ID = 901;
const ALBUM_NAME = "Lorem ipsum";
const PROCESSING_VIDEO_SLOT = 3;
const FILLER_PHOTOS = 5;
const RENAMED = ["Dolor sit", "Amet consectetur"] as const;

const SLOTS: AlbumSlot[] = [
	{},
	{ video: true },
	{ processing: true },
	{ video: true, processing: true },
	...Array.from({ length: FILLER_PHOTOS }, () => ({})),
];

const slotsAlbum = albumAnswer({
	albumId: MY_ALBUM_ID,
	name: ALBUM_NAME,
	slots: SLOTS,
});

const processingVideoRefused: RestFault = {
	method: "DELETE",
	path: `/v1/albums/${MY_ALBUM_ID}/content/${albumContentId({ albumId: MY_ALBUM_ID, slot: PROCESSING_VIDEO_SLOT })}`,
	status: 400,
};

const renameFails = failing({
	method: "PUT",
	path: `/v2/albums/${MY_ALBUM_ID}`,
});

async function renameAndSave({
	page,
	name,
}: {
	page: Page;
	name: string;
}): Promise<void> {
	await page.getByRole("textbox", { name: "Album name" }).fill(name);
	await saveChanges(page);
}

async function openSharedWith({
	page,
	albumId,
}: {
	page: Page;
	albumId: number;
}): Promise<void> {
	await openAlbum({ page, albumId });
	await page.getByRole("button", { name: "Shared with" }).click();
	await page.locator('[data-slot="shared-with-list"]').waitFor();
}

export const newAlbum: Scene = {
	platform: "phone",
	demo: { restFaults: [{ method: "POST", path: "/v2/albums", status: 402 }] },
	views: [
		{
			id: "settings/albums/new",
			drive: (page) =>
				visit({
					page,
					path: "/settings/albums/new",
					ready: page.getByText("Add a photo to start your album"),
				}),
		},
		{
			id: "settings/albums/new/failures",
			screen: "settings/albums/new",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				const add = page.getByRole("button", {
					name: "Add photos or videos",
				});
				const choose = () =>
					chooseGeneratedMedia({ page, open: () => add.click() });
				await addingToast({ page, action: choose });
				await changeScene({
					page,
					scene: {
						restFaults: [
							failing({ method: "POST", path: "/v2/albums" }),
						],
					},
				});
				await addingToast({ page, action: choose });
			},
		},
	],
};

export const emptyAlbum: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			albumAnswer({ albumId: MY_ALBUM_ID, name: ALBUM_NAME, slots: [] }),
		],
	},
	views: [
		{
			id: "settings/albums/album/empty",
			drive: async (page) => {
				await openAlbum({ page, albumId: MY_ALBUM_ID });
				await page.getByText("No Media Yet").waitFor();
			},
		},
		{
			id: "settings/albums/album/previous-uploads-empty",
			screen: "settings/albums/album/empty",
			drive: async (page) => {
				await changeScene({ page, scene: { emptyLists: ["drawer"] } });
				await openPreviousUploads(page);
				await sheet(page).getByText("No Previous Uploads").waitFor();
			},
		},
	],
};

export const albumSlots: Scene = {
	platform: "phone",
	demo: { restFaults: [slotsAlbum] },
	views: [
		{
			id: "settings/albums/album/slots",
			scroller: SUBPAGE_SCROLLER,
			drive: (page) => openAlbum({ page, albumId: MY_ALBUM_ID }),
		},
		{
			id: "settings/albums/album/slots-removed",
			drive: async (page) => {
				await slotButton({
					page,
					name: "Remove album photo in slot 1",
				}).click();
				await slotButton({
					page,
					name: "Remove album video in slot 2",
				}).click();
				await page
					.getByRole("button", { name: "Save changes" })
					.waitFor();
			},
		},
		{
			id: "settings/albums/album/add-to-album",
			screen: "settings/albums/album/slots-removed",
			drive: async (page) => {
				await openPreviousUploads(page);
				await sheetTiles(page).first().click();
				await sheet(page)
					.getByRole("button", { name: "Add to album" })
					.waitFor();
			},
		},
		{
			id: "settings/albums/album/save-results",
			screen: "settings/albums/album/slots-removed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await closeSheet(page);
				await changeScene({
					page,
					scene: { restFaults: [slotsAlbum, processingVideoRefused] },
				});
				await slotButton({
					page,
					name: "Remove album video in slot 4",
				}).click();
				await saveChanges(page);
				await slotButton({ page, name: "Keep album video" }).click();
				await renameAndSave({ page, name: RENAMED[0] });
				await changeScene({
					page,
					scene: { restFaults: [slotsAlbum, renameFails] },
				});
				await renameAndSave({ page, name: RENAMED[1] });
			},
		},
	],
};

export const albumDeletion: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/albums/album/menu",
			screen: "settings/albums/album",
			drive: async (page) => {
				await openAlbum({ page, albumId: MY_ALBUM_ID });
				await albumMenu(page).click();
				await page
					.getByRole("menuitem", { name: "Delete album" })
					.waitFor();
			},
		},
		{
			id: "settings/albums/album/delete-confirm",
			screen: "settings/albums/album",
			drive: async (page) => {
				await page
					.getByRole("menuitem", { name: "Delete album" })
					.click();
				await page.locator(ALERT).waitFor();
			},
		},
		{
			id: "settings/albums/album/delete-results",
			screen: "settings/albums",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				const confirm = () =>
					page
						.locator(ALERT)
						.getByRole("button", { name: "Delete" })
						.click();
				await changeScene({
					page,
					scene: {
						restFaults: [
							failing({
								method: "DELETE",
								path: `/v1/albums/${MY_ALBUM_ID}`,
							}),
						],
					},
				});
				await addingToast({ page, action: confirm });
				await changeScene({ page, scene: { restFaults: [] } });
				await albumMenu(page).click();
				await page
					.getByRole("menuitem", { name: "Delete album" })
					.click();
				await addingToast({ page, action: confirm });
				await page.waitForURL("**/settings/albums");
			},
		},
	],
};

export const emptySharedWith: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/albums/album/shared-with-empty",
			screen: "settings/albums/album",
			drive: async (page) => {
				await openSharedWith({ page, albumId: MY_ALBUM_ID });
				await page.getByText("Not shared yet").waitFor();
			},
		},
	],
};

export const sharedWith: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/albums/album/shared-with",
			screen: "settings/albums/album",
			drive: async (page) => {
				await openSharedWith({ page, albumId: SHARED_ALBUM_ID });
				await page.getByRole("checkbox").first().waitFor();
			},
		},
	],
};
