import type { Page } from "@playwright/test";

import { GRID_READY_SELECTOR } from "../../../e2e/support/app";
import { openAllFilters } from "../../../e2e/support/grid-filters";
import { profileTile } from "../../../e2e/support/gps";
import { ACTIVE_PANE } from "../../../e2e/support/profile-pager";
import {
	CONVERSATIONS_SCROLLER,
	installFakeOverscroll,
} from "../../../e2e/support/pull";
import { showsLoading } from "../settle";
import type { Scene } from ".";
import { chooseNeutralLocation, GRID_SCROLLER } from "./browse";
import { INBOX_ROW, openInbox } from "./chat-drive";
import { holdToast } from "./toast";
import { visit } from "./visit";

const GRID_SCROLL_PX = 2400;
const WHEEL_TOWARD_TOP = -40;
const PULLING_BAND_PX = 16;
const ARMED_BAND_PX = 36;

async function pullInboxBand({
	page,
	bandPx,
}: {
	page: Page;
	bandPx: number;
}): Promise<void> {
	await page
		.locator(CONVERSATIONS_SCROLLER)
		.evaluate(async (scroller, band) => {
			const banded: Element & { __band?: number } = scroller;
			const pause = () =>
				new Promise((resolve) => setTimeout(resolve, 30));
			const content = scroller.querySelector<HTMLElement>(
				":scope > [data-refresh-content]",
			);
			for (const px of [0, band / 2, band]) {
				scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -8 }));
				banded.__band = px;
				content?.style.setProperty("translate", `0 ${px}px`);
				scroller.dispatchEvent(new Event("scroll"));
				await pause();
			}
		}, bandPx);
}

export const notFound: Scene = {
	platform: "phone",
	views: [
		{
			id: "shell/not-found",
			drive: (page) =>
				visit({
					page,
					path: "/no-such-page",
					ready: page.getByRole("link", { name: "Go to Browse" }),
				}),
		},
	],
};

export const errorPage: Scene = {
	platform: "phone",
	demo: {
		methodFaults: [
			{
				command: "current_session",
				error: { kind: "Http", message: "Request failed" },
			},
		],
	},
	views: [
		{
			id: "shell/error",
			drive: (page) =>
				visit({
					page,
					path: "/",
					ready: page.getByRole("button", {
						name: "Copy error details",
					}),
				}),
		},
	],
};

export const saveChanges: Scene = {
	platform: "phone",
	views: [
		{
			id: "shell/save-changes",
			drive: async (page) => {
				await visit({
					page,
					path: "/settings/profile",
					ready: page.getByRole("textbox", { name: "Display name" }),
				});
				await page
					.getByRole("textbox", { name: "Display name" })
					.fill("River");
				await page
					.getByRole("button", { name: "Save changes" })
					.waitFor();
			},
		},
	],
};

export const scrollToTop: Scene = {
	platform: "phone",
	views: [
		{
			id: "shell/scroll-to-top",
			drive: async (page) => {
				await chooseNeutralLocation(page);
				await profileTile(page).nth(8).waitFor();
				await page.locator(GRID_SCROLLER).evaluate((scroller, top) => {
					scroller.scrollTo({ top, behavior: "instant" });
				}, GRID_SCROLL_PX);
				await page
					.getByRole("button", { name: "Scroll to top" })
					.waitFor();
			},
		},
	],
};

export const refreshButton: Scene = {
	platform: "desktop",
	views: [
		{
			id: "shell/refresh-button",
			drive: async (page) => {
				await openInbox(page);
				await page
					.locator(CONVERSATIONS_SCROLLER)
					.dispatchEvent("wheel", { deltaY: WHEEL_TOWARD_TOP });
				await page.getByRole("button", { name: "Refresh" }).waitFor();
			},
		},
	],
};

export const pullHints: Scene = {
	platform: "desktop",
	views: [
		{
			id: "shell/pull-hint",
			drive: async (page) => {
				await installFakeOverscroll(page);
				await openInbox(page);
				await pullInboxBand({ page, bandPx: PULLING_BAND_PX });
				await page.getByText("Pull to refresh").waitFor();
			},
		},
	],
};

export const releaseHint: Scene = {
	platform: "desktop",
	views: [
		{
			id: "shell/release-hint",
			drive: async (page) => {
				await installFakeOverscroll(page);
				await openInbox(page);
				await pullInboxBand({ page, bandPx: ARMED_BAND_PX });
				await page.getByText("Release to refresh").waitFor();
			},
		},
	],
};

export const loadingFilters: Scene = {
	platform: "phone",
	demo: { restFaults: [{ path: "/public/v2/genders", pending: true }] },
	views: [
		{
			id: "browse/filters/loading",
			drive: async (page) => {
				showsLoading(page);
				await chooseNeutralLocation(page);
				await page.locator(GRID_READY_SELECTOR).waitFor();
				await openAllFilters(page);
				const genders = page.locator('[data-slot="gender-filter"]');
				await genders.scrollIntoViewIfNeeded();
				await genders.getByRole("status").waitFor();
			},
		},
	],
};

export const signOutConfirm: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/sign-out",
			drive: async (page) => {
				await visit({
					page,
					path: "/settings",
					ready: page.getByRole("button", { name: "Sign out" }),
				});
				await page.getByRole("button", { name: "Sign out" }).click();
				await page.getByRole("alertdialog").waitFor();
			},
		},
	],
};

export const deleteConversations: Scene = {
	platform: "desktop",
	views: [
		{
			id: "chat/inbox/row-menu",
			drive: async (page) => {
				await openInbox(page);
				await page
					.locator(INBOX_ROW)
					.first()
					.click({ button: "right" });
				await page.getByRole("menu").waitFor();
			},
		},
		{
			id: "chat/inbox/delete",
			drive: async (page) => {
				await page.getByRole("menuitem", { name: "Delete" }).click();
				await page.getByRole("alertdialog").waitFor();
			},
		},
	],
};

export const blockIgnored: Scene = {
	platform: "phone",
	demo: { emptyLists: ["blocks"] },
	views: [
		{
			id: "profile/block-ignored",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				const menu = page
					.locator(ACTIVE_PANE)
					.getByRole("button", { name: "Profile menu" });
				await visit({ page, path: "/profile/100001", ready: menu });
				await menu.click();
				await page
					.getByRole("menuitem", { name: "Block user" })
					.click();
				await page
					.getByRole("button", { name: "Learn more" })
					.waitFor();
				await holdToast(page);
			},
		},
	],
};
