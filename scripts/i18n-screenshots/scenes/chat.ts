import type { Page } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	DEMO_CONVERSATION_ID,
	MESSAGE_ROW,
} from "../../../e2e/support/app";
import { DRAWER } from "../../../e2e/support/drawer";
import type { Scene } from ".";
import { holdToast } from "./toast";
import { visit } from "./visit";

const INBOX_ROW = 'main a[href^="/chat/"]';
const FILTER_PILL =
	"[data-fixed-header] button:not([aria-label], [aria-pressed])";
const DEMO_CONVERSATION_ROW = `main a[href="${DEMO_CONVERSATION}"]`;
export const TEXT_CONVERSATION = "/chat/100009:123456000";
const MESSAGE_BUBBLE = '[data-slot="message"] [data-slot="message-bubble"]';
const MESSAGE_MENU = 'dialog[open] [data-slot="context-menu-list"]';

export const inbox: Scene = {
	platform: "desktop",
	views: [
		{
			id: "chat/inbox",
			drive: (page) =>
				visit({ page, path: "/chat", ready: page.locator(INBOX_ROW) }),
		},
		{
			id: "chat/inbox/filter",
			drive: async (page) => {
				await page.locator(FILTER_PILL).first().click();
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
				await page
					.locator(DEMO_CONVERSATION_ROW)
					.first()
					.click({ button: "right" });
				await page
					.getByRole("button", { name: "Pin selected" })
					.waitFor();
			},
		},
		{
			id: "chat/inbox/pin-failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await page
					.getByRole("button", { name: "Pin selected" })
					.click();
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
			drive: async (page) => {
				await page
					.locator(MESSAGE_BUBBLE)
					.last()
					.click({ button: "right" });
				await page.locator(MESSAGE_MENU).waitFor();
			},
		},
	],
};

export const attachments: Scene = {
	platform: "phone",
	views: [
		{
			id: "chat/attachments",
			drive: async (page) => {
				await openConversation(page);
				await page
					.getByRole("button", { name: "Add attachment" })
					.click();
				await page.locator(DRAWER).waitFor();
			},
		},
	],
};
