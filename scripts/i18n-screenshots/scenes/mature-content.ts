import type { Page } from "@playwright/test";

import type { Scene } from ".";
import { MESSAGES_SCROLLER, openConversation, scrollToTop } from "./chat-drive";
import {
	KINDS_ID,
	MEDIA_REPLIES_ID,
	MEDIA_REPLIES_INBOX,
	PREVIEWS_INBOX,
} from "./chat-fixtures";
import { openDisplaySettings } from "./settings";

const THREAD_COVER = `${MESSAGES_SCROLLER} [data-slot="mature-content-cover"]`;

async function showCoveredThread({
	page,
	withId,
}: {
	page: Page;
	withId: number;
}): Promise<void> {
	await openConversation({ page, withId });
	await page.locator(THREAD_COVER).first().waitFor();
	await scrollToTop({ page, scroller: MESSAGES_SCROLLER });
}

export const matureContentSetting: Scene = {
	platform: "phone",
	demo: { playBuild: true },
	views: [{ id: "settings/display-play", drive: openDisplaySettings }],
};

export const matureContentCovers: Scene = {
	platform: "phone",
	demo: { playBuild: true, inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/conversation/kinds-play",
			scroller: MESSAGES_SCROLLER,
			drive: async (page) => {
				await showCoveredThread({ page, withId: KINDS_ID });
				await page
					.getByRole("button", { name: "Scroll to newest messages" })
					.waitFor();
			},
		},
	],
};

export const matureContentReplies: Scene = {
	platform: "phone",
	demo: { playBuild: true, inbox: MEDIA_REPLIES_INBOX },
	views: [
		{
			id: "chat/conversation/media-replies-play",
			scroller: MESSAGES_SCROLLER,
			drive: (page) =>
				showCoveredThread({ page, withId: MEDIA_REPLIES_ID }),
		},
	],
};
