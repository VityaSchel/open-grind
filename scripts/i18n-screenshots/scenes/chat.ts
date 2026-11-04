import type { Page } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	DEMO_CONVERSATION_ID,
	MESSAGE_ROW,
} from "../../../e2e/support/app";
import { DRAWER } from "../../../e2e/support/drawer";
import type { Scene } from ".";
import { MESSAGE_MENU, openInbox } from "./chat-drive";
import { openContextMenu, press } from "./press";
import { holdToast } from "./toast";
import { visit } from "./visit";

const FILTER_PILL =
	"[data-fixed-header] button:not([aria-label], [aria-pressed])";
const DEMO_CONVERSATION_ROW = `main a[href="${DEMO_CONVERSATION}"]`;
export const TEXT_CONVERSATION = "/chat/100009:123456000";
const MESSAGE_BUBBLE = '[data-slot="message"] [data-slot="message-bubble"]';

export const inbox: Scene = {
	platform: "desktop",
	views: [
		{ id: "chat/inbox", drive: openInbox },
		{
			id: "chat/inbox/filter",
			screen: "chat/inbox",
			drive: async (page) => {
				await press(page.locator(FILTER_PILL).first());
				await page.getByRole("dialog").waitFor();
			},
		},
	],
};

export const inboxPinFailure: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			{
				method: "POST",
				path: `/v4/chat/conversation/${DEMO_CONVERSATION_ID}/pin`,
				status: 500,
			},
		],
	},
	views: [
		{
			id: "chat/inbox/selection",
			drive: async (page) => {
				await visit({
					page,
					path: "/chat",
					ready: page.locator(DEMO_CONVERSATION_ROW),
				});
				await openContextMenu({
					target: page.locator(DEMO_CONVERSATION_ROW).first(),
					ready: page.getByRole("button", { name: "Pin selected" }),
				});
			},
		},
		{
			id: "chat/inbox/pin-failed",
			screen: "chat/inbox/previews",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await press(page.getByRole("button", { name: "Pin selected" }));
				await holdToast(page);
			},
		},
	],
};

function openConversation(page: Page): Promise<void> {
	return visit({
		page,
		path: TEXT_CONVERSATION,
		ready: page.locator(MESSAGE_ROW),
	});
}

export const conversation: Scene = {
	platform: "phone",
	views: [
		{ id: "chat/conversation", drive: openConversation },
		{
			id: "chat/conversation/menu",
			screen: "chat/conversation",
			drive: async (page) => {
				await openContextMenu({
					target: page.locator(MESSAGE_BUBBLE).last(),
					ready: page.locator(MESSAGE_MENU),
				});
			},
		},
	],
};

export const attachments: Scene = {
	platform: "phone",
	views: [
		{
			id: "chat/attachments",
			screen: "chat/conversation",
			drive: async (page) => {
				await openConversation(page);
				await press(
					page.getByRole("button", { name: "Add attachment" }),
				);
				await page.locator(DRAWER).waitFor();
			},
		},
	],
};
