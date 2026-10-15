import type { Locator, Page } from "@playwright/test";

import { demoMeProfileId } from "../../../src/lib/demo/config";
import type { RestFault } from "../../../src/lib/demo/screenshot-scene";
import type { Scene } from ".";
import { scrollToCenter } from "./drive";
import { failing } from "./faults";
import { addingToast } from "./toast";
import { visit } from "./visit";

export const PROFILE_EDIT_PATH = "/settings/profile";
const PROFILE_UPDATE = { method: "PUT", path: "/v3.1/me/profile" };
const ALL_PRONOUNS = [1, 2, 3];
const UNMATCHED_SEARCH = "qqqq";
const BANNED_TERMS = {
	type: "urn:gr:err:hit_banned_terms",
	display_name: { terms: ["alpha"] },
	about_me: { terms: ["beta", "gamma"] },
};
const UNPROCESSABLE = 422;
const US_REGION = {
	locale: "en-US",
	numberLocale: "en-US",
	hourCycle: "h12",
	twoDigitHour: false,
	dateOrder: "mdy",
	decimalSeparator: ".",
	groupSeparator: ",",
	numberingSystem: "latn",
	firstDayOfWeek: 7,
	measurementSystem: "us",
};

export function displayNameField(page: Page): Locator {
	return page.getByRole("textbox", { name: "Display name" });
}

export function openProfileEdit(page: Page): Promise<void> {
	return visit({
		page,
		path: PROFILE_EDIT_PATH,
		ready: displayNameField(page),
	});
}

function aboutMeField(page: Page): Locator {
	return page.getByRole("textbox", { name: "About me" });
}

function pronounsField(page: Page): Locator {
	return page.getByRole("combobox", { name: "Pronouns" });
}

function saveProfile(page: Page): Promise<void> {
	return addingToast({
		page,
		action: async () => {
			await displayNameField(page).fill("Alpha");
			await page.getByRole("button", { name: "Save changes" }).click();
		},
	});
}

function savingScene({
	id,
	screen,
	restFaults = [],
}: {
	id: string;
	screen: string;
	restFaults?: RestFault[];
}): Scene {
	return {
		platform: "phone",
		demo: { restFaults },
		views: [
			{
				id,
				screen,
				survivesLocaleSwitch: false,
				drive: async (page) => {
					await openProfileEdit(page);
					await saveProfile(page);
				},
			},
		],
	};
}

export const emptyProfileFields: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/profile/empty-name",
			drive: async (page) => {
				await openProfileEdit(page);
				await displayNameField(page).fill("");
				await aboutMeField(page).fill("");
				await scrollToCenter(displayNameField(page));
			},
		},
		{
			id: "settings/profile/empty-about",
			drive: (page) => scrollToCenter(aboutMeField(page)),
		},
	],
};

export const profileExpectations: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/profile/expectations",
			drive: async (page) => {
				await openProfileEdit(page);
				await scrollToCenter(page.getByText("Accept NSFW pics"));
			},
		},
	],
};

export const profileCombos: Scene = {
	platform: "phone",
	demo: { profiles: { [demoMeProfileId]: { pronouns: ALL_PRONOUNS } } },
	views: [
		{
			id: "settings/profile/combo-at-max",
			drive: async (page) => {
				await openProfileEdit(page);
				await scrollToCenter(pronounsField(page));
				await page.getByText("remove one to add another").waitFor();
			},
		},
		{
			id: "settings/profile/combo-no-matches",
			screen: "settings/profile/combo-at-max",
			drive: async (page) => {
				await pronounsField(page).click();
				await pronounsField(page).fill(UNMATCHED_SEARCH);
				await page.getByText("No matches").waitFor();
			},
		},
	],
};

export const profileBannedTerms = savingScene({
	id: "settings/profile/banned-terms",
	screen: "shell/save-changes",
	restFaults: [
		{ ...PROFILE_UPDATE, status: UNPROCESSABLE, body: BANNED_TERMS },
	],
});

export const profileSaveFailed = savingScene({
	id: "settings/profile/save-failed",
	screen: "shell/save-changes",
	restFaults: [failing(PROFILE_UPDATE)],
});

export const profileSaved = savingScene({
	id: "settings/profile/saved",
	screen: "settings/profile",
});

export const profileLoadFailed: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			failing({ method: "GET", path: `/v7/profiles/${demoMeProfileId}` }),
		],
	},
	views: [
		{
			id: "settings/profile/load-failed",
			drive: (page) =>
				visit({
					page,
					path: PROFILE_EDIT_PATH,
					ready: page.getByText("load your profile"),
				}),
		},
	],
};

export const imperialProfile: Scene = {
	platform: "phone",
	native: { regional_settings: { answer: US_REGION } },
	views: [
		{
			id: "settings/profile/imperial",
			drive: async (page) => {
				await openProfileEdit(page);
				await scrollToCenter(
					page.getByRole("textbox", { name: "Weight" }),
				);
			},
		},
	],
};
