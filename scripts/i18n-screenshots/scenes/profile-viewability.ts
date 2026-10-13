import type { Page } from "@playwright/test";

import type { RestFault } from "../../../src/lib/demo/screenshot-scene";
import type { Scene } from ".";
import { changeScene } from "./drive";
import { failing } from "./faults";
import {
	BLOCKED_BY_US_ID,
	chooseProfileAction,
	FAVORITE_ID,
	openProfile,
	OTHER_ID,
	profileActionToast,
} from "./profile-drive";
import { addingToast } from "./toast";

function retryFailing({
	page,
	fault,
	button,
}: {
	page: Page;
	fault: RestFault;
	button: string;
}): Promise<void> {
	return addingToast({
		page,
		action: async () => {
			await changeScene({ page, scene: { restFaults: [fault] } });
			await page.getByRole("button", { name: button }).click();
		},
	});
}

export const blockedByUs: Scene = {
	platform: "phone",
	demo: { maskedProfiles: [BLOCKED_BY_US_ID] },
	views: [
		{
			id: "profile/blocked-by-us",
			drive: (page) =>
				openProfile({
					page,
					profileId: BLOCKED_BY_US_ID,
					ready: page.getByRole("button", { name: "Unblock" }),
				}),
		},
		{
			id: "profile/unblock-failed",
			survivesLocaleSwitch: false,
			drive: (page) =>
				retryFailing({
					page,
					fault: failing({
						method: "DELETE",
						path: `/v3/me/blocks/${BLOCKED_BY_US_ID}`,
					}),
					button: "Unblock",
				}),
		},
	],
};

export const blockedByThem: Scene = {
	platform: "phone",
	demo: { maskedProfiles: [OTHER_ID] },
	views: [
		{
			id: "profile/blocked-by-them",
			drive: (page) =>
				openProfile({
					page,
					profileId: OTHER_ID,
					ready: page.getByRole("link", { name: "report an issue" }),
				}),
		},
	],
};

export const hiddenProfile: Scene = {
	platform: "phone",
	views: [
		{
			id: "profile/hidden",
			drive: async (page) => {
				await openProfile({ page, profileId: FAVORITE_ID });
				await chooseProfileAction({ page, action: "Hide user" });
				await page.getByRole("button", { name: "Unhide" }).waitFor();
			},
		},
		{
			id: "profile/unhide-failed",
			survivesLocaleSwitch: false,
			drive: (page) =>
				retryFailing({
					page,
					fault: failing({
						method: "DELETE",
						path: `/v1/hides/${FAVORITE_ID}`,
					}),
					button: "Unhide",
				}),
		},
	],
};

export const viewabilityFailures: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			failing({ method: "POST", path: `/v1/me/hides/${FAVORITE_ID}` }),
			failing({ method: "POST", path: `/v3/me/blocks/${FAVORITE_ID}` }),
		],
	},
	views: [
		{
			id: "profile/hide-block-failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openProfile({ page, profileId: FAVORITE_ID });
				await profileActionToast({ page, action: "Hide user" });
				await profileActionToast({ page, action: "Block user" });
			},
		},
	],
};
