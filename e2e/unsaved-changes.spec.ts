import { expect, type Page, test } from "@playwright/test";

import { backLink, FIRST_ROUTE_COMPILE_MS, meTab } from "./support/app";
import { openSettings, SETTINGS, stackSettled } from "./support/page-stack";
import {
	cancelSystemBack,
	commitSystemBack,
	startSystemBack,
} from "./support/system-back";

const RENAMED = "Renamed in a test";

const discardPrompt = (page: Page) =>
	page.getByRole("alertdialog", { name: "Discard changes?" });
const displayName = (page: Page) =>
	page.getByRole("textbox", { name: "Display name" });

async function openProfileEditor(page: Page): Promise<string> {
	await page.getByRole("link", { name: "View your profile" }).click();
	await page.getByRole("link", { name: "Edit profile" }).click();
	await expect(page).toHaveURL(/\/settings\/profile$/);
	await displayName(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	return displayName(page).inputValue();
}

async function keepEditing(page: Page): Promise<void> {
	await expect(discardPrompt(page)).toBeVisible();
	await page.getByRole("button", { name: "Keep editing" }).click();
	await expect(discardPrompt(page)).toHaveCount(0);
	await expect(page).toHaveURL(/\/settings\/profile$/);
	await expect(displayName(page)).toHaveValue(RENAMED);
}

test.describe.configure({ timeout: 240_000 });

test("the profile editor asks before Back, the back gesture or the Me tab drops an edit", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });
	const saved = await openProfileEditor(page);
	await displayName(page).fill(RENAMED);

	await backLink(page).click();
	await keepEditing(page);

	expect(await startSystemBack(page), "the edit holds the page still").toBe(
		false,
	);
	await cancelSystemBack(page);
	await stackSettled(page);
	expect(await commitSystemBack(page), "the edit takes Back").toBe(false);
	await keepEditing(page);

	await meTab(page).click();
	await expect(discardPrompt(page)).toBeVisible();
	await page.getByRole("button", { name: "Discard" }).click();
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));

	await openProfileEditor(page);
	await expect(displayName(page)).toHaveValue(saved);
});

test("the profile editor lets go without asking once its edit is saved", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });
	await openProfileEditor(page);
	await displayName(page).fill(RENAMED);
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(
		page.getByRole("button", { name: "Save changes" }),
	).toHaveCount(0);

	await backLink(page).click();

	await expect(page).not.toHaveURL(/\/settings\/profile$/);
	await expect(discardPrompt(page)).toHaveCount(0);
});
