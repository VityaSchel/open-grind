import type { Page } from "@playwright/test";

import { ACTIVE_PANE } from "../../../e2e/support/profile-pager";
import type { Scene } from ".";
import { chooseNeutralLocation } from "./browse";
import { ALERT } from "./drive";
import { press } from "./press";
import { visit } from "./visit";

const FEED_SCROLLER = '[data-slot="right-now-scroller"]';
const POST = '[data-slot="right-now-post"]';
const JOIN_BUTTON = '[data-slot="join-button"] button';
const SHEET = '[role="dialog"]';
const HOSTING_PROFILE = "/profile/100006";

async function openFeed(page: Page): Promise<void> {
	await chooseNeutralLocation(page);
	await press(page.locator('nav a[href="/right-now"]'));
	await page.locator(POST).nth(2).waitFor();
	await page.locator(JOIN_BUTTON).waitFor();
}

async function openJoinConfirmation(page: Page): Promise<void> {
	await press(page.locator(JOIN_BUTTON));
	await page.locator(ALERT).waitFor();
}

async function joinAndOpenSheet(page: Page): Promise<void> {
	await press(page.locator(`${ALERT} [data-slot="alert-dialog-action"]`));
	await page
		.locator(SHEET)
		.getByRole("switch", { name: "Show my post", disabled: false })
		.waitFor();
}

export const rightNow: Scene = {
	platform: "phone",
	views: [
		{ id: "browse/right-now", scroller: FEED_SCROLLER, drive: openFeed },
		{
			id: "browse/right-now/hosting-filter",
			screen: "browse/right-now",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await press(
					page
						.locator('[data-fixed-header] [data-slot="button"]')
						.filter({ hasText: "Hosting" }),
				);
				await page.locator(SHEET).waitFor();
			},
		},
	],
};

export const rightNowReport: Scene = {
	platform: "phone",
	views: [
		{
			id: "browse/right-now/report",
			screen: "browse/right-now",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openFeed(page);
				await press(
					page
						.locator(POST)
						.getByRole("button", { name: "Report post" })
						.first(),
				);
				await page.locator('[data-slot="report-reasons"]').waitFor();
			},
		},
	],
};

export const rightNowJoin: Scene = {
	platform: "phone",
	views: [
		{
			id: "browse/right-now/join",
			screen: "browse/right-now",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openFeed(page);
				await openJoinConfirmation(page);
			},
		},
		{
			id: "browse/right-now/sheet",
			screen: "browse/right-now/joined",
			survivesLocaleSwitch: false,
			drive: joinAndOpenSheet,
		},
		{
			id: "browse/right-now/sheet/map",
			screen: "browse/right-now/joined",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await press(
					page
						.locator(SHEET)
						.getByRole("switch", { name: "Show me on map" }),
				);
				await page
					.locator('[data-slot="post-location-accuracy"]')
					.waitFor();
			},
		},
		{
			id: "browse/right-now/discard",
			screen: "browse/right-now/joined",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await page.locator(`${SHEET} textarea`).fill("Lorem ipsum");
				await page.keyboard.press("Escape");
				await page.locator(ALERT).waitFor();
			},
		},
		{
			id: "browse/right-now/joined",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await press(
					page.locator(`${ALERT} [data-slot="alert-dialog-action"]`),
				);
				await page.locator(SHEET).waitFor({ state: "detached" });
				await page
					.locator(POST)
					.getByRole("button", { name: "Edit your post" })
					.waitFor();
			},
		},
	],
};

export const profileRightNow: Scene = {
	platform: "phone",
	views: [
		{
			id: "profile/right-now",
			drive: async (page) => {
				await visit({
					page,
					path: HOSTING_PROFILE,
					ready: page
						.locator(ACTIVE_PANE)
						.locator('[data-slot="profile-right-now-post-open"]'),
				});
				await page
					.locator(ACTIVE_PANE)
					.locator('[data-slot="profile-right-now-post"]')
					.scrollIntoViewIfNeeded();
			},
		},
		{
			id: "profile/right-now/viewer",
			screen: "profile/right-now",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await press(
					page
						.locator(ACTIVE_PANE)
						.locator('[data-slot="profile-right-now-post-open"]'),
				);
				await page
					.locator('[data-slot="right-now-post-caption"]')
					.waitFor();
			},
		},
	],
};
