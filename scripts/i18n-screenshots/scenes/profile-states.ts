import { profileTile } from "../../../e2e/support/gps";
import { demoMeProfileId } from "../../../src/lib/demo/config";
import type { RestFault } from "../../../src/lib/demo/screenshot-scene";
import type { Scene, SceneView } from ".";
import { chooseNeutralLocation } from "./browse";
import { failing } from "./faults";
import {
	FAVORITE_ID,
	inActivePane,
	openProfile,
	OTHER_ID,
	profilePath,
} from "./profile-drive";
import { addingToast } from "./toast";
import { visit } from "./visit";

const DETAILED_ID = 100004;
const COOKIE_TAPPED_ID = 100005;
const FIRE_TAPPED_ID = 100007;
const DEMON_TAPPED_ID = 100008;
const VISITING_OFFLINE_ID = 123457009;
const VISITING_ONLINE_ID = 123456353;
const MANY_UNREAD_ID = 123456489;
const MANY_UNREAD = 120;
const ONLINE_UNTIL_LATER = Date.parse("2100-01-01T00:00:00Z");
const HEIGHT_CM = 183;
const HEADING_ABOVE_TOASTS_PX = 320;
const PROFILE_SCROLLER = '[data-slot="profile-scroller"]';
const SEND_FIRE_TAP = "Send a Fire tap";
const TAP_OPTIONS = '[data-slot="dropdown-menu-content"]';

const MEET_AT_EVERYWHERE = [1, 2, 3, 4, 5];
const NSFW_NOT_AT_FIRST = 2;
const HIV_PREFER_TO_DISCUSS = 5;
const SOBER_AND_DRUG_FREE = [6, 7];

const failingGendersAndPronouns: RestFault[] = [
	failing({ method: "GET", path: "/public/v2/genders" }),
	failing({ method: "GET", path: "/v1/pronouns" }),
];

export const profileDetails: Scene = {
	platform: "phone",
	demo: {
		profiles: {
			[DETAILED_ID]: {
				isNew: true,
				onlineUntil: null,
				seen: null,
				nsfw: NSFW_NOT_AT_FIRST,
				meetAt: MEET_AT_EVERYWHERE,
				hivStatus: HIV_PREFER_TO_DISCUSS,
				sexualHealth: SOBER_AND_DRUG_FREE,
				genders: [1],
				pronouns: [1],
			},
		},
		restFaults: failingGendersAndPronouns,
	},
	views: [
		{
			id: "profile/details",
			scroller: PROFILE_SCROLLER,
			drive: async (page) => {
				await openProfile({ page, profileId: DETAILED_ID });
				await page.locator('[data-slot="new-badge"]').waitFor();
			},
		},
	],
};

export const imperialVisit: Scene = {
	platform: "phone",
	demo: {
		profiles: { [FAVORITE_ID]: { height: HEIGHT_CM } },
		restFaults: [
			failing({ method: "POST", path: { pattern: "^/v5/views/" } }),
		],
	},
	views: [
		{
			id: "profile/imperial",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await visit({
					page,
					path: "/settings/app",
					ready: page.getByText("Imperial"),
				});
				await page.getByText("Imperial").click();
				await page
					.getByRole("switch", { name: "Reveal profile views" })
					.click();
				await addingToast({
					page,
					action: async () => {
						await page
							.getByRole("link", { name: "Interest" })
							.click();
						await page
							.locator(
								`main a[href="${profilePath(FAVORITE_ID)}"]`,
							)
							.first()
							.click();
					},
				});
				await page
					.locator(PROFILE_SCROLLER)
					.evaluate((scroller, top) => {
						scroller.scrollTo({ top, behavior: "instant" });
					}, HEADING_ABOVE_TOASTS_PX);
			},
		},
	],
};

export const visitingTiles: Scene = {
	platform: "phone",
	demo: {
		profiles: {
			[VISITING_OFFLINE_ID]: { isVisiting: true, onlineUntil: null },
			[VISITING_ONLINE_ID]: {
				isVisiting: true,
				onlineUntil: ONLINE_UNTIL_LATER,
			},
			[MANY_UNREAD_ID]: { unreadCount: MANY_UNREAD },
		},
	},
	views: [
		{
			id: "browse/grid/visiting",
			drive: async (page) => {
				await chooseNeutralLocation(page);
				await profileTile(page).nth(8).waitFor();
			},
		},
	],
};

export const ownProfile: Scene = {
	platform: "phone",
	views: [
		{
			id: "profile/own",
			drive: (page) =>
				openProfile({
					page,
					profileId: demoMeProfileId,
					ready: page.getByRole("link", { name: "Edit profile" }),
				}),
		},
	],
};

function tapSent({
	profileId,
	tap,
}: {
	profileId: number;
	tap: string;
}): SceneView {
	return {
		id: `profile/tap-sent/${tap.toLowerCase()}`,
		drive: (page) =>
			openProfile({
				page,
				profileId,
				ready: inActivePane({ page, name: `${tap} tap sent` }),
			}),
	};
}

export const tapStates: Scene = {
	platform: "phone",
	demo: {
		profiles: {
			[COOKIE_TAPPED_ID]: { tapType: 0 },
			[FIRE_TAPPED_ID]: { tapType: 1 },
			[DEMON_TAPPED_ID]: { tapType: 2 },
		},
	},
	views: [
		{
			id: "profile/tap-options",
			drive: async (page) => {
				await openProfile({ page, profileId: OTHER_ID });
				await inActivePane({ page, name: SEND_FIRE_TAP }).click({
					button: "right",
				});
				await page.locator(TAP_OPTIONS).waitFor();
			},
		},
		tapSent({ profileId: COOKIE_TAPPED_ID, tap: "Cookie" }),
		tapSent({ profileId: FIRE_TAPPED_ID, tap: "Fire" }),
		tapSent({ profileId: DEMON_TAPPED_ID, tap: "Demon" }),
	],
};

export const tapFailure: Scene = {
	platform: "phone",
	demo: { restFaults: [failing({ method: "POST", path: "/v2/taps/add" })] },
	views: [
		{
			id: "profile/tap-failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openProfile({ page, profileId: OTHER_ID });
				await addingToast({
					page,
					action: () =>
						inActivePane({ page, name: SEND_FIRE_TAP }).click(),
				});
			},
		},
	],
};
