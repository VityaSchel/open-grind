import type { Locator, Page } from "@playwright/test";

import { ACTIVE_PANE } from "../../../e2e/support/profile-pager";
import { LIGHTBOX } from "../../../e2e/support/video";
import type { Scene } from ".";
import {
	MESSAGES_SCROLLER,
	openConversation,
	openInbox,
	scrollToTop,
} from "./chat-drive";
import { MEDIA_REPLIES_ID, MEDIA_REPLIES_INBOX } from "./chat-fixtures";
import { failChunks } from "./faults";
import { openProfile } from "./profile-drive";
import { addingToast } from "./toast";

const THREAD = "chat/conversation/media-replies";
const LIGHTBOX_BANNER = "PhotoSwipe Lightbox";
const REPLY_TEXT = "Lorem ipsum dolor.";

function sendReplyButton(page: Page): Locator {
	return page.getByRole("button", { name: "Send reply", disabled: false });
}

async function typeReply({
	page,
	textbox,
}: {
	page: Page;
	textbox: string;
}): Promise<void> {
	await page.getByRole("textbox", { name: textbox }).fill(REPLY_TEXT);
	await sendReplyButton(page).waitFor();
}

export const mediaReplies: Scene = {
	platform: "phone",
	demo: { inbox: MEDIA_REPLIES_INBOX },
	views: [
		{ id: "chat/inbox/media-replies", drive: openInbox },
		{
			id: THREAD,
			scroller: MESSAGES_SCROLLER,
			drive: async (page) => {
				await openConversation({ page, withId: MEDIA_REPLIES_ID });
				await scrollToTop({ page, scroller: MESSAGES_SCROLLER });
			},
		},
		{
			id: "media/lightbox/album-reaction",
			screen: THREAD,
			drive: async (page) => {
				await page
					.getByRole("button", { name: "Open reacted album content" })
					.dispatchEvent("click");
				await page.locator(LIGHTBOX).waitFor();
				await page
					.getByRole("button", {
						name: "React to album item with fire",
						disabled: false,
					})
					.waitFor();
			},
		},
		{
			id: "media/lightbox/album-reply",
			screen: THREAD,
			drive: (page) =>
				typeReply({ page, textbox: "Reply to album item" }),
		},
	],
};

export const photoReplyOpenFailure: Scene = {
	platform: "phone",
	demo: { inbox: MEDIA_REPLIES_INBOX },
	views: [
		{
			id: "chat/conversation/photo-reply-open-failed",
			screen: THREAD,
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await failChunks({ page, containing: LIGHTBOX_BANNER });
				await openConversation({ page, withId: MEDIA_REPLIES_ID });
				await addingToast({
					page,
					action: () =>
						page
							.getByRole("button", {
								name: "Open replied profile photo",
							})
							.first()
							.click(),
				});
			},
		},
	],
};

export const profilePhotoReply: Scene = {
	platform: "phone",
	views: [
		{
			id: "profile/lightbox/reply",
			screen: "profile",
			drive: async (page) => {
				await openProfile({ page, profileId: MEDIA_REPLIES_ID });
				await page
					.locator(`${ACTIVE_PANE} .item[href]`)
					.first()
					.click();
				await page.locator(LIGHTBOX).waitFor();
				await typeReply({ page, textbox: "Reply to profile photo" });
			},
		},
		{
			id: "profile/lightbox/reply-sent",
			screen: "profile",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await addingToast({
					page,
					action: () => sendReplyButton(page).click(),
				});
				await page.locator(LIGHTBOX).waitFor({ state: "detached" });
			},
		},
	],
};
