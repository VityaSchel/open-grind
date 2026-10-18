import type { Page } from "@playwright/test";

import {
	EXPIRING_IMAGE,
	EXPIRING_VIDEO,
	MESSAGE_ROW,
} from "../../../e2e/support/app";
import type { RestFault } from "../../../src/lib/demo/screenshot-scene";
import type { Scene } from ".";
import {
	chooseFromMessageMenu,
	composerInput,
	inboxRow,
	lastIncoming,
	lastOutgoing,
	MESSAGE_MENU,
	messageMenuClosed,
	MESSAGES_SCROLLER,
	openConversation,
	openInbox,
	openMessageMenu,
	revealRefreshButton,
	scrollToTop,
} from "./chat-drive";
import {
	conversationPath,
	KINDS_ID,
	MORE_QUOTES_ID,
	PHOTO_ID,
	PREVIEWS_INBOX,
	QUOTES_ID,
} from "./chat-fixtures";
import { changeScene } from "./drive";
import { failChunks, failing } from "./faults";
import { addingToast, holdToast } from "./toast";
import { visit } from "./visit";

const MESSAGES = { pattern: "^/v5/chat/conversation/" };
const OLDER_MESSAGES = { pattern: "^/v5/chat/conversation/.*[?&]pageKey=" };
const SINGLE_MESSAGE = { pattern: "^/v4/chat/conversation/[^/]+/message/" };
const SEND = "/v4/chat/message/send";
const REACT_WITH_FIRE = "React with fire";
const LIGHTBOX_BANNER = "PhotoSwipe Lightbox";

async function showWholeThread({
	page,
	withId,
}: {
	page: Page;
	withId: number;
}): Promise<void> {
	await openConversation({ page, withId });
	await scrollToTop({ page, scroller: MESSAGES_SCROLLER });
}

async function sendText(page: Page): Promise<void> {
	await composerInput(page).fill("Lorem ipsum dolor");
	await page.getByRole("button", { name: "Send message" }).click();
}

export const conversationThreads: Scene = {
	platform: "phone",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/conversation/kinds",
			scroller: MESSAGES_SCROLLER,
			drive: async (page) => {
				await showWholeThread({ page, withId: KINDS_ID });
				await page
					.getByRole("button", { name: "Scroll to newest messages" })
					.waitFor();
			},
		},
		{
			id: "chat/conversation/quotes",
			scroller: MESSAGES_SCROLLER,
			drive: (page) => showWholeThread({ page, withId: QUOTES_ID }),
		},
		{
			id: "chat/conversation/more-quotes",
			scroller: MESSAGES_SCROLLER,
			drive: (page) => showWholeThread({ page, withId: MORE_QUOTES_ID }),
		},
	],
};

export const touchMessageMenu: Scene = {
	platform: "phone",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/conversation/incoming-menu",
			screen: "chat/conversation/quotes",
			drive: async (page) => {
				await openConversation({ page, withId: QUOTES_ID });
				const bubble = lastOutgoing(page).locator(
					'[data-slot="message-bubble"]',
				);
				const box = await bubble.first().boundingBox();
				if (box === null) throw new Error("No outgoing bubble to tap");
				await page.touchscreen.tap(
					box.x + box.width / 2,
					box.y + box.height / 2,
				);
				await lastIncoming(page).dispatchEvent("contextmenu");
				await page
					.locator(MESSAGE_MENU)
					.getByText("Double tap")
					.waitFor();
			},
		},
	],
};

export const pointerMessageMenu: Scene = {
	platform: "desktop",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/conversation/react-menu",
			screen: "chat/conversation/actions-button",
			drive: async (page) => {
				await openConversation({ page, withId: QUOTES_ID });
				await openMessageMenu(lastIncoming(page));
				await page
					.getByRole("button", { name: REACT_WITH_FIRE })
					.waitFor();
			},
		},
		{
			id: "chat/conversation/actions-button",
			drive: async (page) => {
				await page.keyboard.press("Escape");
				await messageMenuClosed(page);
				await page.keyboard.press("Tab");
				const actions = page.getByRole("button", {
					name: "Message actions",
				});
				await actions.last().focus();
				await actions
					.last()
					.and(page.locator(":focus-visible"))
					.waitFor();
			},
		},
	],
};

export const copiedMessage: Scene = {
	platform: "phone",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/conversation/copied",
			screen: "chat/conversation/quotes",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openConversation({ page, withId: QUOTES_ID });
				await chooseFromMessageMenu({
					row: lastIncoming(page),
					action: "Copy message",
				});
				await holdToast(page);
			},
		},
	],
};

export const messageFailures: Scene = {
	platform: "desktop",
	demo: {
		inbox: PREVIEWS_INBOX,
		restFaults: [
			failing({ method: "POST", path: "/v4/chat/message/unsend" }),
			failing({ method: "POST", path: "/v4/chat/message/delete" }),
			failing({ method: "POST", path: "/v4/chat/message/reaction" }),
		],
	},
	views: [
		{
			id: "chat/conversation/message-failures",
			screen: "chat/conversation/actions-button",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openConversation({ page, withId: QUOTES_ID });
				await addingToast({
					page,
					action: () =>
						chooseFromMessageMenu({
							row: lastIncoming(page),
							action: REACT_WITH_FIRE,
						}),
				});
				for (const action of ["Unsend message", "Delete for me"]) {
					await addingToast({
						page,
						action: () =>
							chooseFromMessageMenu({
								row: lastOutgoing(page),
								action,
							}),
					});
				}
			},
		},
	],
};

export const expiringMediaFailures: Scene = {
	platform: "phone",
	demo: {
		inbox: PREVIEWS_INBOX,
		restFaults: [failing({ method: "GET", path: SINGLE_MESSAGE })],
	},
	views: [
		{
			id: "chat/conversation/media-load-failures",
			screen: "chat/conversation/kinds#2",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openConversation({ page, withId: KINDS_ID });
				for (const media of [EXPIRING_IMAGE, EXPIRING_VIDEO]) {
					await addingToast({
						page,
						action: () => page.locator(media).first().click(),
					});
				}
			},
		},
	],
};

export const expiringMediaOpenFailures: Scene = {
	platform: "phone",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/conversation/media-open-failures",
			screen: "chat/conversation/kinds#2",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await failChunks({ page, containing: LIGHTBOX_BANNER });
				await openConversation({ page, withId: KINDS_ID });
				for (const media of [EXPIRING_IMAGE, EXPIRING_VIDEO]) {
					await addingToast({
						page,
						action: () => page.locator(media).first().click(),
					});
				}
			},
		},
	],
};

export const unavailableConversation: Scene = {
	platform: "phone",
	demo: {
		inbox: PREVIEWS_INBOX,
		restFaults: [
			{
				method: "GET",
				path: MESSAGES,
				status: 403,
				body: { type: "urn:gr:err:unauthorized_action" },
			},
		],
	},
	views: [
		{
			id: "chat/conversation/unavailable",
			drive: (page) =>
				visit({
					page,
					path: conversationPath(KINDS_ID),
					ready: page.getByText(
						"Conversation is no longer available",
					),
				}),
		},
	],
};

export const conversationRefreshFailures: Scene = {
	platform: "desktop",
	demo: {
		inbox: PREVIEWS_INBOX,
		restFaults: [failing({ method: "GET", path: OLDER_MESSAGES })],
	},
	views: [
		{
			id: "chat/conversation/refresh-failures",
			screen: "chat/conversation/actions-button",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await addingToast({
					page,
					action: () => openConversation({ page, withId: KINDS_ID }),
				});
				await changeScene({
					page,
					scene: {
						restFaults: [
							failing({ method: "GET", path: MESSAGES }),
						],
					},
				});
				await addingToast({
					page,
					action: async () => {
						const refresh = await revealRefreshButton({
							page,
							scroller: MESSAGES_SCROLLER,
							towardTop: false,
						});
						await refresh.click();
					},
				});
			},
		},
	],
};

function sendingScene({
	id,
	fault,
	status,
}: {
	id: string;
	fault: RestFault;
	status: string;
}): Scene {
	return {
		platform: "phone",
		demo: { inbox: PREVIEWS_INBOX, restFaults: [fault] },
		views: [
			{
				id,
				drive: async (page) => {
					await openConversation({ page, withId: QUOTES_ID });
					await sendText(page);
					await page.getByText(status).waitFor();
				},
			},
		],
	};
}

export const sendingMessage = sendingScene({
	id: "chat/conversation/sending",
	fault: { method: "POST", path: SEND, pending: true },
	status: "Sending…",
});

export const unsentMessage = sendingScene({
	id: "chat/conversation/not-sent",
	fault: failing({ method: "POST", path: SEND }),
	status: "Not sent",
});

export const markReadFailure: Scene = {
	platform: "phone",
	demo: {
		inbox: PREVIEWS_INBOX,
		restFaults: [failing({ method: "POST", path: { pattern: "/read/" } })],
	},
	views: [
		{
			id: "chat/conversation/mark-read-failed",
			screen: "chat/conversation",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openInbox(page);
				await addingToast({
					page,
					action: async () => {
						await inboxRow({ page, withId: PHOTO_ID }).click();
						await page.locator(MESSAGE_ROW).first().waitFor();
					},
				});
			},
		},
	],
};

export const syncFailure: Scene = {
	platform: "phone",
	demo: {
		inbox: PREVIEWS_INBOX,
		restFaults: [failing({ method: "POST", path: "/v4/inbox" })],
	},
	views: [
		{
			id: "chat/conversation/sync-failed",
			screen: "chat/conversation/quotes",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openConversation({ page, withId: QUOTES_ID });
				await addingToast({ page, action: () => sendText(page) });
			},
		},
	],
};
