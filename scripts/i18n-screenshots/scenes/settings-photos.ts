import type { Page } from "@playwright/test";

import type { RestFault } from "../../../src/lib/demo/screenshot-scene";
import { showsLoading } from "../settle";
import type { Scene } from ".";
import { sheet, sheetTiles } from "./album-drive";
import { failRandomUuids } from "./chat-drive";
import { changeScene, chooseGeneratedMedia } from "./drive";
import { failing } from "./faults";
import { openProfileEdit } from "./settings-profile";
import { SHOWN_TOAST, toastsShown } from "./toast";

const UPLOAD = { method: "POST", path: "/v4/media/upload" };
const PREVIOUS_UPLOADS: RestFault = {
	method: "GET",
	path: "/v3.1/me/profile/images",
	status: 200,
	body: {
		medias: ["a1", "b2", "c3"].map((seed) => ({
			mediaHash: seed.repeat(20),
			type: 1,
			state: 2,
		})),
	},
};
const AWAITING_REVIEW: RestFault = {
	...UPLOAD,
	status: 200,
	body: { imageSizes: [{ mediaHash: "d4".repeat(20), state: "Pending" }] },
};
const DAILY_LIMIT = 403;
const PAST_ROOM = 5;

async function openPhotoSheet(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Add photos" }).click();
	await sheet(page).getByText("Previous Uploads").first().waitFor();
}

function uploadPhotos({
	page,
	photos,
}: {
	page: Page;
	photos: number;
}): Promise<void> {
	return chooseGeneratedMedia({
		page,
		photos,
		open: async () => {
			await openPhotoSheet(page);
			await sheet(page)
				.getByRole("button", { name: "Upload photos" })
				.click();
		},
	});
}

function uploadToasts({
	id,
	restFaults,
	upload,
	count,
}: {
	id: string;
	restFaults: RestFault[];
	upload: (page: Page) => Promise<void>;
	count: number;
}): Scene {
	return {
		platform: "phone",
		demo: { restFaults },
		views: [
			{
				id,
				screen: "settings/profile",
				survivesLocaleSwitch: false,
				drive: async (page) => {
					await openProfileEdit(page);
					await upload(page);
					await toastsShown({ page, count });
				},
			},
		],
	};
}

export const previousProfilePhotos: Scene = {
	platform: "phone",
	demo: { restFaults: [PREVIOUS_UPLOADS] },
	views: [
		{
			id: "settings/profile/photos/sheet",
			screen: "settings/profile",
			drive: async (page) => {
				await openProfileEdit(page);
				await openPhotoSheet(page);
				await sheetTiles(page).first().click();
				await page
					.getByRole("button", { name: "Add to profile" })
					.waitFor();
			},
		},
	],
};

export const profilePhotoSlots: Scene = {
	platform: "phone",
	demo: { restFaults: [AWAITING_REVIEW] },
	views: [
		{
			id: "settings/profile/photos/uploading",
			drive: async (page) => {
				showsLoading(page);
				await openProfileEdit(page);
				await page
					.getByRole("button", {
						name: "Remove profile photo in slot 1",
					})
					.click();
				await uploadPhotos({ page, photos: 1 });
				await page
					.getByRole("img", { name: /awaiting review/ })
					.waitFor();
				await changeScene({
					page,
					scene: { restFaults: [{ ...UPLOAD, pending: true }] },
				});
				await uploadPhotos({ page, photos: 1 });
				await page
					.getByRole("img", { name: "Uploading profile photo" })
					.waitFor();
			},
		},
	],
};

export const profilePhotoLimits = uploadToasts({
	id: "settings/profile/photos/limits",
	restFaults: [{ ...UPLOAD, status: DAILY_LIMIT }],
	upload: (page) => uploadPhotos({ page, photos: PAST_ROOM }),
	count: 2,
});

export const profilePhotoFailures = uploadToasts({
	id: "settings/profile/photos/failures",
	restFaults: [failing(UPLOAD)],
	upload: async (page) => {
		await uploadPhotos({ page, photos: 1 });
		await page.locator(SHOWN_TOAST).first().waitFor();
		await failRandomUuids(page);
		await uploadPhotos({ page, photos: 1 });
	},
	count: 2,
});
