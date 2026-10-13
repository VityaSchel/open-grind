import type { Page } from "@playwright/test";

import { CONVERSATIONS_SCROLLER } from "../../../e2e/support/pull";
import type { RestFault } from "../../../src/lib/demo/screenshot-scene";
import { showsLoading } from "../settle";
import type { Scene } from ".";
import {
	composerInput,
	inboxRow,
	openConversation,
	openInbox,
	revealRefreshButton,
	scrollToBottom,
} from "./chat-drive";
import {
	KINDS_ID,
	PAGED_INBOX,
	PINNED_ID,
	PINNED_MUTED_ID,
	PREVIEWS_INBOX,
} from "./chat-fixtures";
import { ALERT, changeScene } from "./drive";
import { CONNECT_FAILED } from "./faults";
import { addingToast } from "./toast";
import { visit } from "./visit";

const COLLAPSED_SELECTION_BAR = { width: 280, height: 800 };
const SECOND_PAGE = { pattern: "^/v4/inbox\\?page=2$" };

function flagFault(action: "unpin" | "mute" | "unmute"): RestFault {
	return {
		method: "POST",
		path: { pattern: `/${action}$` },
		error: CONNECT_FAILED,
	};
}

async function openRowMenu({
	page,
	withId,
}: {
	page: Page;
	withId: number;
}): Promise<void> {
	await inboxRow({ page, withId }).click({ button: "right" });
	await page.getByRole("menu").waitFor();
}

async function chooseFromRowMenu({
	page,
	withId,
	action,
}: {
	page: Page;
	withId: number;
	action: string;
}): Promise<void> {
	await openRowMenu({ page, withId });
	await page.getByRole("menuitem", { name: action }).click();
	await page.getByRole("menu").waitFor({ state: "hidden" });
}

async function selectRow({
	page,
	withId,
}: {
	page: Page;
	withId: number;
}): Promise<void> {
	await inboxRow({ page, withId }).click({ button: "right" });
	await page.getByRole("navigation", { name: "Selection" }).waitFor();
}

export const inboxPreviews: Scene = {
	platform: "phone",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/inbox/previews",
			scroller: CONVERSATIONS_SCROLLER,
			drive: openInbox,
		},
	],
};

export const inboxDraft: Scene = {
	platform: "phone",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/composer/typed",
			drive: async (page) => {
				await openConversation({ page, withId: KINDS_ID });
				await composerInput(page).fill("Lorem ipsum dolor");
				await page
					.getByRole("button", { name: "Send message" })
					.waitFor();
			},
		},
		{
			id: "chat/inbox/draft",
			drive: async (page) => {
				await page.getByRole("link", { name: "Back to Inbox" }).click();
				await page.getByText("Draft:").waitFor();
			},
		},
	],
};

export const emptyInbox: Scene = {
	platform: "phone",
	demo: { emptyLists: ["inbox"] },
	views: [
		{
			id: "chat/inbox/empty",
			drive: (page) =>
				visit({
					page,
					path: "/chat",
					ready: page.getByText("No Conversations Yet"),
				}),
		},
		{
			id: "chat/inbox/filtered-empty",
			drive: async (page) => {
				await page
					.locator("[data-fixed-header]")
					.getByRole("button", { name: "Unread" })
					.click();
				await page
					.getByText("No conversations match these filters.")
					.waitFor();
			},
		},
	],
};

export const rowMenus: Scene = {
	platform: "desktop",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/inbox/row-menu/pinned",
			drive: async (page) => {
				await openInbox(page);
				await openRowMenu({ page, withId: PINNED_MUTED_ID });
				await page.getByRole("menuitem", { name: "Unmute" }).waitFor();
			},
		},
		{
			id: "chat/inbox/row-menu/unpinned",
			drive: async (page) => {
				await page.keyboard.press("Escape");
				await page.getByRole("menu").waitFor({ state: "hidden" });
				await openRowMenu({ page, withId: KINDS_ID });
				await page.getByRole("menuitem", { name: "Pin" }).waitFor();
			},
		},
	],
};

export const inboxSelection: Scene = {
	platform: "phone",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/inbox/selection/pinned",
			drive: async (page) => {
				await openInbox(page);
				await selectRow({ page, withId: PINNED_ID });
				await page
					.getByRole("button", { name: "Unpin selected" })
					.waitFor();
			},
		},
		{
			id: "chat/inbox/delete-many",
			drive: async (page) => {
				await page
					.getByRole("button", { name: "Benjamin", pressed: false })
					.click();
				await page.getByText("2 selected").waitFor();
				await page
					.getByRole("button", { name: "Delete selected" })
					.click();
				await page.locator(ALERT).waitFor();
			},
		},
	],
};

export const collapsedSelection: Scene = {
	platform: "phone",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/inbox/selection/collapsed",
			drive: async (page) => {
				await page.setViewportSize(COLLAPSED_SELECTION_BAR);
				await openInbox(page);
				await selectRow({ page, withId: PINNED_ID });
				await page
					.getByRole("button", { name: "Selection actions" })
					.waitFor();
			},
		},
	],
};

export const inboxFlagFailures: Scene = {
	platform: "desktop",
	demo: {
		inbox: PREVIEWS_INBOX,
		restFaults: [
			flagFault("unpin"),
			flagFault("mute"),
			flagFault("unmute"),
		],
	},
	views: [
		{
			id: "chat/inbox/flag-failures",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openInbox(page);
				const failures = [
					{ withId: PINNED_MUTED_ID, action: "Unpin" },
					{ withId: PINNED_MUTED_ID, action: "Unmute" },
					{ withId: KINDS_ID, action: "Mute" },
				];
				for (const { withId, action } of failures) {
					await addingToast({
						page,
						action: () =>
							chooseFromRowMenu({ page, withId, action }),
					});
				}
			},
		},
	],
};

export const inboxRefreshFailures: Scene = {
	platform: "desktop",
	demo: { inbox: PREVIEWS_INBOX },
	views: [
		{
			id: "chat/inbox/refresh-failures",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openInbox(page);
				await changeScene({
					page,
					scene: {
						restFaults: [
							{
								method: "POST",
								path: "/v4/inbox",
								error: CONNECT_FAILED,
							},
							{
								method: "DELETE",
								path: { pattern: "^/v4/chat/conversation/" },
								error: CONNECT_FAILED,
							},
						],
					},
				});
				await addingToast({
					page,
					action: async () => {
						await chooseFromRowMenu({
							page,
							withId: KINDS_ID,
							action: "Delete",
						});
						await page
							.locator(ALERT)
							.getByRole("button", { name: "Delete" })
							.click();
					},
				});
				await addingToast({
					page,
					action: async () => {
						const refresh = await revealRefreshButton({
							page,
							scroller: CONVERSATIONS_SCROLLER,
							towardTop: true,
						});
						await refresh.click();
					},
				});
			},
		},
	],
};

export const inboxLoadMoreFailure: Scene = {
	platform: "phone",
	demo: {
		inbox: PAGED_INBOX,
		restFaults: [
			{ method: "POST", path: SECOND_PAGE, error: CONNECT_FAILED },
		],
	},
	views: [
		{
			id: "chat/inbox/load-more-failed",
			drive: async (page) => {
				await openInbox(page);
				await scrollToBottom({
					page,
					scroller: CONVERSATIONS_SCROLLER,
				});
				await page.getByRole("button", { name: "Try again" }).waitFor();
			},
		},
	],
};

export const inboxLoadingMore: Scene = {
	platform: "phone",
	demo: {
		inbox: PAGED_INBOX,
		restFaults: [{ method: "POST", path: SECOND_PAGE, pending: true }],
	},
	views: [
		{
			id: "chat/inbox/loading-more",
			drive: async (page) => {
				showsLoading(page);
				await openInbox(page);
				await scrollToBottom({
					page,
					scroller: CONVERSATIONS_SCROLLER,
				});
				await page
					.getByRole("status")
					.getByText("Loading more conversations")
					.waitFor({ state: "attached" });
			},
		},
	],
};
