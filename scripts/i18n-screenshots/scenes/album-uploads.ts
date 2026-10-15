import type { RestFault } from "../../../src/lib/demo/screenshot-scene";
import type { Scene } from ".";
import {
	MEDIA_SLOT,
	openAlbum,
	openPreviousUploads,
	sheet,
	sheetTiles,
	skipReconcileWaits,
	uploadToAlbum,
} from "./album-drive";
import { changeScene } from "./drive";
import { failing } from "./faults";
import { addingToast, toastsShown } from "./toast";

const PHOTO_ALBUM_ID = 900;
const FIVE_PHOTO_ALBUM_ID = 902;
const PHOTOS_PAST_ROOM = 8;
const VIDEOS_PAST_ROOM = 2;
const PLAN_LIMIT = 402;
const REFUSED = 400;
const TOO_LARGE = 413;

function uploadPath(albumId: number): string {
	return `/v1/albums/${albumId}/content`;
}

function uploadsAnswered({
	albumId,
	status,
}: {
	albumId: number;
	status: number;
}): RestFault {
	return { method: "POST", path: uploadPath(albumId), status };
}

const ADD_FROM_DRAWER = `/v1/albums/${PHOTO_ALBUM_ID}/content/chat/list-by-id`;

const addingFull: RestFault = {
	method: "POST",
	path: ADD_FROM_DRAWER,
	status: PLAN_LIMIT,
};

const addingFails = failing({ method: "POST", path: ADD_FROM_DRAWER });

function uploadToasts({ id, status }: { id: string; status: number }): Scene {
	return {
		platform: "phone",
		demo: {
			restFaults: [uploadsAnswered({ albumId: PHOTO_ALBUM_ID, status })],
		},
		views: [
			{
				id,
				screen: "settings/albums/album",
				survivesLocaleSwitch: false,
				drive: async (page) => {
					await openAlbum({ page, albumId: PHOTO_ALBUM_ID });
					await uploadToAlbum({ page, photos: 1, videos: 1 });
					await toastsShown({ page, count: 2 });
				},
			},
		],
	};
}

export const albumUploadLimits: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/albums/album/upload-limits",
			screen: "settings/albums/album",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAlbum({ page, albumId: PHOTO_ALBUM_ID });
				await uploadToAlbum({
					page,
					photos: PHOTOS_PAST_ROOM,
					videos: VIDEOS_PAST_ROOM,
				});
				await toastsShown({ page, count: 2 });
			},
		},
	],
};

export const albumUploadsFull = uploadToasts({
	id: "settings/albums/album/uploads-full",
	status: PLAN_LIMIT,
});

export const albumUploadsRefused = uploadToasts({
	id: "settings/albums/album/uploads-refused",
	status: REFUSED,
});

export const albumUploadsTooLarge = uploadToasts({
	id: "settings/albums/album/uploads-too-large",
	status: TOO_LARGE,
});

export const albumUploading: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			{
				method: "POST",
				path: uploadPath(FIVE_PHOTO_ALBUM_ID),
				pending: true,
			},
		],
	},
	views: [
		{
			id: "settings/albums/album/uploading",
			drive: async (page) => {
				await openAlbum({ page, albumId: FIVE_PHOTO_ALBUM_ID });
				await uploadToAlbum({ page, photos: 1, videos: 1 });
				await page
					.locator(MEDIA_SLOT)
					.getByRole("img", { name: "Uploading video" })
					.waitFor();
			},
		},
	],
};

export const albumAddResults: Scene = {
	platform: "phone",
	demo: { restFaults: [addingFull] },
	views: [
		{
			id: "settings/albums/album/add-results",
			screen: "settings/albums/album",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				const submit = () =>
					sheet(page)
						.getByRole("button", { name: "Add to album" })
						.click();
				await openAlbum({ page, albumId: PHOTO_ALBUM_ID });
				await openPreviousUploads(page);
				await sheetTiles(page).first().click();
				await addingToast({ page, action: submit });
				await changeScene({
					page,
					scene: { restFaults: [addingFails] },
				});
				await addingToast({ page, action: submit });
				await changeScene({
					page,
					scene: {
						restFaults: [
							failing({
								method: "GET",
								path: `/v2/albums/${PHOTO_ALBUM_ID}`,
							}),
						],
					},
				});
				await skipReconcileWaits(page);
				await addingToast({ page, action: submit });
			},
		},
	],
};
