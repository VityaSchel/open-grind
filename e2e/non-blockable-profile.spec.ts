import { expect, type Page, test } from "@playwright/test";

import { captureOpenedUrls, installTauriShim } from "./support/app";
import { DRAWER } from "./support/drawer";

const BLOCKABLE_PROFILE = "/profile/100001";
const NON_BLOCKABLE_PROFILE = "/profile/100010";
const BLOCKING_GUIDE =
	"https://opengrind.org/guides/blocking-and-hiding-profiles";
const GUIDE_NAME = "Why can't I block this profile?";
const BLOCKED = "You have blocked this profile.";

async function openProfileMenu({
	page,
	profile,
}: {
	page: Page;
	profile: string;
}) {
	await installTauriShim(page);
	await page.goto(profile);
	await page.getByLabel("Profile menu").click();
	await page.getByRole("menuitem", { name: "Hide profile" }).waitFor();
}

async function reportAsSpam({
	page,
	profile,
}: {
	page: Page;
	profile: string;
}) {
	await openProfileMenu({ page, profile });
	await page.getByRole("menuitem", { name: "Report profile" }).click();

	const drawer = page.locator(DRAWER);
	await drawer.waitFor({ timeout: 10_000 });
	await page.waitForTimeout(700);

	await drawer.getByRole("radio", { name: "Spam" }).click();
	await drawer.getByRole("button", { name: "Submit report" }).click();
	await expect(
		drawer.getByText("Grindr will review this profile."),
	).toBeVisible();
	return drawer;
}

test("a blockable profile offers both hide and block, and blocks", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await openProfileMenu({ page, profile: BLOCKABLE_PROFILE });

	const block = page.getByRole("menuitem", { name: "Block profile" });
	await expect(block).toBeEnabled();
	expect(await page.getByRole("menuitem", { name: GUIDE_NAME }).count()).toBe(
		0,
	);
	await block.click();

	await expect(page.getByText(BLOCKED)).toBeVisible();
});

test("a non-blockable profile shows Block disabled with a link to the blocking guide", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await openProfileMenu({ page, profile: NON_BLOCKABLE_PROFILE });
	const opened = await captureOpenedUrls(page);

	const block = page.getByRole("menuitem", { name: "Block profile" });
	await expect(block).toBeVisible();
	await expect(block).toBeDisabled();
	await block.click({ force: true });

	const guide = page.getByRole("menuitem", { name: GUIDE_NAME });
	await expect(guide).toBeVisible();
	await guide.click();

	await expect.poll(opened).toEqual([BLOCKING_GUIDE]);
	await expect(block).toBeHidden();
	expect(await page.getByText(BLOCKED).count()).toBe(0);
});

test("the keyboard skips a disabled Block and reaches the blocking guide", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await installTauriShim(page);
	await page.goto(NON_BLOCKABLE_PROFILE);
	const opened = await captureOpenedUrls(page);

	await page.getByLabel("Profile menu").focus();
	await page.keyboard.press("Enter");
	await page.getByRole("menuitem", { name: "Hide profile" }).focus();
	await page.keyboard.press("ArrowDown");

	await expect(
		page.getByRole("menuitem", { name: GUIDE_NAME }),
	).toBeFocused();
	await page.keyboard.press("Enter");

	await expect.poll(opened).toEqual([BLOCKING_GUIDE]);
	expect(await page.getByText(BLOCKED).count()).toBe(0);
});

test("reporting a non-blockable profile shows Block disabled with a link to the blocking guide", async ({
	page,
}) => {
	test.setTimeout(240_000);
	const drawer = await reportAsSpam({ page, profile: NON_BLOCKABLE_PROFILE });
	const opened = await captureOpenedUrls(page);

	const block = drawer.getByRole("button", { name: "Block profile" });
	await expect(block).toBeVisible();
	await expect(block).toBeDisabled();
	expect(
		await drawer
			.getByText("You can block this profile so you stop seeing it.")
			.count(),
	).toBe(0);
	await block.click({ force: true });
	await drawer.getByRole("link", { name: GUIDE_NAME }).click();

	await expect.poll(opened).toEqual([BLOCKING_GUIDE]);
	await expect(drawer).toBeVisible();
	expect(await page.getByText(BLOCKED).count()).toBe(0);
});
