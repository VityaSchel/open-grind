import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import { DRAWER } from "./support/drawer";

const BLOCKABLE_PROFILE = "/profile/100001";
const NON_BLOCKABLE_PROFILE = "/profile/100010";

async function openProfileMenu({
	page,
	profile,
}: {
	page: import("@playwright/test").Page;
	profile: string;
}) {
	await installTauriShim(page);
	await page.goto(profile);
	await page.getByLabel("Profile Menu").click();
	await page.getByRole("menuitem", { name: "Hide Profile" }).waitFor();
}

test("a blockable profile offers both hide and block", async ({ page }) => {
	test.setTimeout(240_000);
	await openProfileMenu({ page, profile: BLOCKABLE_PROFILE });

	await expect(
		page.getByRole("menuitem", { name: "Block Profile" }),
	).toBeVisible();
});

test("a non-blockable profile offers hide but not block", async ({ page }) => {
	test.setTimeout(240_000);
	await openProfileMenu({ page, profile: NON_BLOCKABLE_PROFILE });

	await expect(
		page.getByRole("menuitem", { name: "Hide Profile" }),
	).toBeVisible();
	await expect(
		page.getByRole("menuitem", { name: "Block Profile" }),
	).toHaveCount(0);
});

test("reporting a non-blockable profile does not offer to block", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await openProfileMenu({ page, profile: NON_BLOCKABLE_PROFILE });
	await page.getByRole("menuitem", { name: "Report Profile" }).click();

	const drawer = page.locator(DRAWER);
	await drawer.waitFor({ timeout: 10_000 });
	await page.waitForTimeout(700);

	await drawer.getByRole("radio", { name: "Spam" }).click();
	await drawer.getByRole("button", { name: "Submit Report" }).click();
	await expect(
		drawer.getByText("Grindr will review this profile."),
	).toBeVisible();

	await expect(drawer.getByRole("button", { name: "Done" })).toBeVisible();
	await expect(
		drawer.getByRole("button", { name: "Block Profile" }),
	).toHaveCount(0);
	await expect(
		drawer.getByText("You can block this profile so you stop seeing it."),
	).toHaveCount(0);
});
