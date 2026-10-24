import type { Page } from "@playwright/test";

import type { Scene, SceneView } from ".";
import {
	chooseFromMessageMenu,
	lastIncoming,
	openConversation,
	revealRefreshButton,
	scrollToTop,
} from "./chat-drive";
import { PREVIEWS_INBOX, QUOTES_ID } from "./chat-fixtures";
import { changeScene } from "./drive";
import { failClipboard, failing } from "./faults";
import {
	chooseProfileAction,
	FAVORITE_ID,
	inActivePane,
	openProfile,
	OTHER_ID,
	profileActionToast,
} from "./profile-drive";
import { addingToast } from "./toast";

const DIALOG = '[role="dialog"]';
const PROFILE_SCROLLER = '[data-slot="profile-scroller"]';
const NOTE_TEXT = "Lorem ipsum dolor";
const COPY_PROFILE_ID = "Copy profile ID";
const REPORT = { pattern: "^/v[0-9.]+/flags/" };
const NOTE = `/v1/favorites/notes/${FAVORITE_ID}`;

async function openNote(page: Page): Promise<void> {
	await openProfile({ page, profileId: FAVORITE_ID });
	await page.getByRole("button", { name: "Add note" }).click();
	await page.locator(DIALOG).waitFor();
}

function noteField(page: Page) {
	return page.locator(DIALOG).getByRole("textbox").first();
}

function saveNote(page: Page): Promise<void> {
	return addingToast({
		page,
		action: () =>
			page.locator(DIALOG).getByRole("button", { name: "Save" }).click(),
	});
}

async function savedNote(page: Page): Promise<void> {
	await saveNote(page);
	await page.locator(DIALOG).waitFor({ state: "hidden" });
	await scrollToTop({ page, scroller: PROFILE_SCROLLER });
}

async function openReport(page: Page): Promise<void> {
	await openProfile({ page, profileId: FAVORITE_ID });
	await chooseProfileAction({ page, action: "Report user" });
	await page.locator(DIALOG).waitFor();
}

function submitReport(page: Page): Promise<void> {
	return page
		.locator(DIALOG)
		.getByRole("button", { name: "Submit report" })
		.click();
}

function favoriteToggleFailure({
	id,
	profileId,
	toggle,
}: {
	id: string;
	profileId: number;
	toggle: string;
}): SceneView {
	return {
		id: `profile/favorite-${id}-failed`,
		screen: "profile",
		survivesLocaleSwitch: false,
		drive: async (page) => {
			await openProfile({ page, profileId });
			await addingToast({
				page,
				action: () =>
					inActivePane({
						page,
						name: toggle,
						role: "switch",
					}).click(),
			});
		},
	};
}

export const favoriteFailures: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			failing({ method: "POST", path: `/v3/me/favorites/${OTHER_ID}` }),
			failing({
				method: "DELETE",
				path: `/v3/me/favorites/${FAVORITE_ID}`,
			}),
		],
	},
	views: [
		favoriteToggleFailure({
			id: "add",
			profileId: OTHER_ID,
			toggle: "Add to favorites",
		}),
		favoriteToggleFailure({
			id: "remove",
			profileId: FAVORITE_ID,
			toggle: "Remove from favorites",
		}),
	],
};

export const favoriteNote: Scene = {
	platform: "phone",
	views: [
		{ id: "profile/note", screen: "profile", drive: openNote },
		{
			id: "profile/note/saved",
			screen: "profile",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await noteField(page).fill(NOTE_TEXT);
				await savedNote(page);
			},
		},
		{
			id: "profile/note/deleted",
			screen: "profile",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await page.getByRole("button", { name: NOTE_TEXT }).click();
				await noteField(page).fill("");
				await savedNote(page);
			},
		},
	],
};

export const favoriteNoteFailure: Scene = {
	platform: "phone",
	demo: { restFaults: [failing({ method: "PUT", path: NOTE })] },
	views: [
		{
			id: "profile/note/save-failed",
			screen: "profile",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openNote(page);
				await noteField(page).fill(NOTE_TEXT);
				await saveNote(page);
			},
		},
	],
};

export const reportFlow: Scene = {
	platform: "phone",
	views: [
		{
			id: "profile/report/details",
			screen: "profile",
			scroller: `${DIALOG} [data-slot="drawer-body"]`,
			drive: async (page) => {
				await openReport(page);
				const dialog = page.locator(DIALOG);
				await dialog
					.getByRole("radio", { name: "Impersonation" })
					.click();
				await dialog
					.getByRole("button", { name: "Profile Photo" })
					.click();
				await dialog
					.getByRole("textbox", { name: "Details (optional)" })
					.waitFor();
			},
		},
		{
			id: "profile/report/submitted",
			screen: "profile",
			drive: async (page) => {
				await submitReport(page);
				await page.locator('[data-slot="report-submitted"]').waitFor();
			},
		},
	],
};

export const reportInPersonIncident: Scene = {
	platform: "phone",
	views: [
		{
			id: "profile/report/in-person-incident",
			screen: "profile",
			scroller: `${DIALOG} [data-slot="drawer-body"]`,
			drive: async (page) => {
				await openReport(page);
				await page
					.locator(DIALOG)
					.getByRole("radio", { name: "Serious In-Person Incident" })
					.click();
				await page
					.locator('[data-slot="report-incident-note"]')
					.waitFor();
			},
		},
	],
};

export const reportFailure: Scene = {
	platform: "phone",
	demo: { restFaults: [failing({ method: "POST", path: REPORT })] },
	views: [
		{
			id: "profile/report/failed",
			screen: "profile",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openReport(page);
				await page
					.locator(DIALOG)
					.getByRole("radio", { name: "Spam" })
					.click();
				await addingToast({ page, action: () => submitReport(page) });
			},
		},
	],
};

export const reportMessages: Scene = {
	platform: "desktop",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/conversation/report",
			screen: "chat/conversation/actions-button",
			drive: async (page) => {
				await openConversation({ page, withId: QUOTES_ID });
				await chooseFromMessageMenu({
					row: lastIncoming(page),
					action: "Report",
				});
				await page.locator(DIALOG).waitFor();
			},
		},
	],
};

export const copyProfileId: Scene = {
	platform: "phone",
	views: [
		{
			id: "profile/id-copied",
			screen: "profile",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openProfile({ page, profileId: FAVORITE_ID });
				await profileActionToast({ page, action: COPY_PROFILE_ID });
			},
		},
		{
			id: "profile/copy-id-failed",
			screen: "profile",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openProfile({ page, profileId: FAVORITE_ID });
				await failClipboard(page);
				await profileActionToast({ page, action: COPY_PROFILE_ID });
			},
		},
	],
};

export const profileRefreshFailure: Scene = {
	platform: "desktop",
	views: [
		{
			id: "profile/refresh-failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openProfile({ page, profileId: FAVORITE_ID });
				await changeScene({
					page,
					scene: {
						restFaults: [
							failing({
								method: "GET",
								path: `/v7/profiles/${FAVORITE_ID}`,
							}),
						],
					},
				});
				const refresh = await revealRefreshButton({
					page,
					scroller: PROFILE_SCROLLER,
					towardTop: true,
				});
				await addingToast({ page, action: () => refresh.click() });
			},
		},
	],
};
