import type { Locator, Page } from "@playwright/test";

import { DEMO_CONVERSATION, MESSAGE_ROW } from "../../../e2e/support/app";
import {
	DRAWER,
	SELECTABLE_MEDIA_TILE,
	SHARED_ALBUM_TILE,
	UNSHARED_ALBUM_TILE,
} from "../../../e2e/support/drawer";
import type {
	NativeError,
	RestFault,
} from "../../../src/lib/demo/screenshot-scene";
import type { Scene } from ".";
import {
	addingToast,
	chooseFromMessageMenu,
	composerInput,
	CONNECT_FAILED,
	failRandomUuids,
	lastIncoming,
	openConversation,
	toastsShown,
} from "./chat-drive";
import { PREVIEWS_INBOX, QUOTES_ID } from "./chat-fixtures";
import { ALERT, chooseGeneratedMedia } from "./drive";
import { holdToast } from "./toast";
import { visit } from "./visit";

const FIRST_UPLOADED_MEDIA_ID = 920_000;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const UPLOAD_LABEL = "Upload photos or videos";
const SHEET_ACTION = '[data-slot="sheet-actions"] button';

type MediaRefusal =
	| "notMedia"
	| "videoUnreadable"
	| "notAPhoto"
	| "photoSizeUnreadable"
	| "photoDamaged"
	| "heicUnsupported"
	| "photoUndecodable"
	| "outsideReadableFolders"
	| "photoTooLarge";

const REFUSAL_VIEWS = [
	["notMedia", "videoUnreadable", "notAPhoto"],
	["photoSizeUnreadable", "photoDamaged", "heicUnsupported"],
	["photoUndecodable", "outsideReadableFolders", "photoTooLarge"],
] as const satisfies readonly (readonly MediaRefusal[])[];

function refusal(reason: MediaRefusal): NativeError {
	return {
		kind: "Media",
		message:
			reason === "photoTooLarge"
				? { reason, maxBytes: MAX_PHOTO_BYTES }
				: { reason },
	};
}

function savingUpload({
	index,
	error,
}: {
	index: number;
	error: NativeError;
}): RestFault {
	return {
		method: "PUT",
		path: `/v4/chat/media/drawer/${FIRST_UPLOADED_MEDIA_ID + index}`,
		error,
	};
}

export async function openAttachments(page: Page): Promise<void> {
	await visit({
		page,
		path: DEMO_CONVERSATION,
		ready: page.locator(MESSAGE_ROW),
	});
	await page.getByRole("button", { name: "Add attachment" }).click();
	await page.locator(DRAWER).waitFor();
}

function sheetAction(page: Page): Locator {
	return page.locator(SHEET_ACTION).last();
}

function sharingAction(page: Page): Locator {
	return sheetAction(page).filter({ hasNotText: "Unshare" });
}

async function openTab({
	page,
	tab,
}: {
	page: Page;
	tab: "Media" | "Albums" | "Location";
}): Promise<void> {
	await page.getByRole("tab", { name: tab }).click();
}

function uploadPhotos({
	page,
	count,
}: {
	page: Page;
	count: number;
}): Promise<void> {
	return chooseGeneratedMedia({
		page,
		photos: count,
		open: () =>
			page.getByRole("button", { name: UPLOAD_LABEL }).first().click(),
	});
}

export const replyPreview: Scene = {
	platform: "phone",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/composer/reply",
			drive: async (page) => {
				await openConversation({ page, withId: QUOTES_ID });
				await chooseFromMessageMenu({
					row: lastIncoming(page),
					action: "Reply",
				});
				await page
					.getByRole("button", { name: "Cancel reply" })
					.waitFor();
			},
		},
	],
};

export const voiceMessage: Scene = {
	platform: "phone",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/composer/voice-unimplemented",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openConversation({ page, withId: QUOTES_ID });
				await page
					.getByRole("button", { name: "Record voice message" })
					.click();
				await holdToast(page);
			},
		},
	],
};

export const composerSendFailure: Scene = {
	platform: "phone",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/composer/send-failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openConversation({ page, withId: QUOTES_ID });
				await composerInput(page).fill("Lorem ipsum dolor");
				await failRandomUuids(page);
				await page
					.getByRole("button", { name: "Send message" })
					.click();
				await holdToast(page);
			},
		},
	],
};

export const attachmentTabs: Scene = {
	platform: "phone",
	views: [
		{
			id: "chat/attachments/media-selected",
			drive: async (page) => {
				await openAttachments(page);
				await page.locator(SELECTABLE_MEDIA_TILE).first().click();
				await sheetAction(page).waitFor();
			},
		},
		{
			id: "chat/attachments/albums-share",
			drive: async (page) => {
				await openTab({ page, tab: "Albums" });
				await page.locator(UNSHARED_ALBUM_TILE).first().click();
				await sharingAction(page).waitFor();
			},
		},
		{
			id: "chat/attachments/albums-unshare",
			drive: async (page) => {
				await page.locator(UNSHARED_ALBUM_TILE).first().click();
				await page.locator(SHARED_ALBUM_TILE).first().click();
				await sheetAction(page).getByText("Unshare").waitFor();
			},
		},
		{
			id: "chat/attachments/location",
			drive: async (page) => {
				await openTab({ page, tab: "Location" });
				await page.getByText("isn’t implemented yet").waitFor();
			},
		},
	],
};

export const emptyAttachments: Scene = {
	platform: "phone",
	demo: { emptyLists: ["drawer", "albums"] },
	views: [
		{
			id: "chat/attachments/media-empty",
			drive: async (page) => {
				await openAttachments(page);
				await page.getByText("No Media Sent Yet").waitFor();
			},
		},
		{
			id: "chat/attachments/albums-empty",
			drive: async (page) => {
				await openTab({ page, tab: "Albums" });
				await page.getByText("No Albums Yet").waitFor();
			},
		},
	],
};

export const albumShareFailures: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			{
				method: "POST",
				path: { pattern: "^/v4/albums/\\d+/shares$" },
				error: CONNECT_FAILED,
			},
			{
				method: "PUT",
				path: { pattern: "^/v1/albums/\\d+/unshares$" },
				error: CONNECT_FAILED,
			},
		],
	},
	views: [
		{
			id: "chat/attachments/share-failures",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAttachments(page);
				await openTab({ page, tab: "Albums" });
				await page.locator(SHARED_ALBUM_TILE).first().click();
				await sheetAction(page).getByText("Unshare").waitFor();
				await addingToast({
					page,
					action: () => sheetAction(page).click(),
				});
				await page.locator(SHARED_ALBUM_TILE).first().click();
				await page.locator(UNSHARED_ALBUM_TILE).first().click();
				await sharingAction(page).waitFor();
				await addingToast({
					page,
					action: () => sheetAction(page).dispatchEvent("click"),
				});
			},
		},
	],
};

export const expiringPhotoLimit: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			{
				method: "POST",
				path: "/v4/chat/message/send",
				status: 403,
				body: { type: "urn:gr:err:entitlement_limit" },
			},
		],
	},
	views: [
		{
			id: "chat/attachments/expiring-limit",
			drive: async (page) => {
				await openAttachments(page);
				await page.locator(SELECTABLE_MEDIA_TILE).first().click();
				await page
					.getByRole("button", { name: "Set photo as expiring" })
					.click();
				await sheetAction(page).click();
				await page.locator(ALERT).waitFor();
			},
		},
	],
};

export const uploadFailure: Scene = {
	platform: "phone",
	demo: { restFaults: [savingUpload({ index: 0, error: CONNECT_FAILED })] },
	views: [
		{
			id: "chat/attachments/upload-failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAttachments(page);
				await uploadPhotos({ page, count: 1 });
				await holdToast(page);
			},
		},
	],
};

export const pickerFailure: Scene = {
	platform: "phone",
	views: [
		{
			id: "chat/attachments/picker-failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAttachments(page);
				await failRandomUuids(page);
				await uploadPhotos({ page, count: 1 });
				await holdToast(page);
			},
		},
	],
};

export const uploadRefusals: Scene[] = REFUSAL_VIEWS.map((reasons, view) => ({
	platform: "phone",
	demo: {
		restFaults: reasons.map((reason, index) =>
			savingUpload({ index, error: refusal(reason) }),
		),
	},
	views: [
		{
			id: `chat/attachments/refusals/${view + 1}`,
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAttachments(page);
				await uploadPhotos({ page, count: reasons.length });
				await toastsShown({ page, count: reasons.length });
			},
		},
	],
}));
