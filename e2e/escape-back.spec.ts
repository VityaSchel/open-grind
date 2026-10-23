import { expect, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	historyEntries,
	installTauriShim,
	MESSAGE_ROW,
} from "./support/app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";
import { APP_SETTINGS, CREDITS, openDeepLink } from "./support/page-stack";
import {
	activeProfilePane,
	openGridProfile,
	profileLoaded,
	profileUrl,
} from "./support/profile-pager";

const PROFILE_WITH_PHOTOS = 100001;
const LIGHTBOX = ".pswp";

test.describe.configure({ timeout: 180_000 });

test("Escape closes a profile opened from Browse", async ({ page }) => {
	await openGridProfile(page, { nth: 0 });

	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/\/$/);
});

test("Escape closes the profile menu, then the photo viewer, then the profile", async ({
	page,
}) => {
	await serveImages(page, CHAT_MEDIA_HOST);
	await serveImages(page, AVATAR_HOST);
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	await page
		.locator(`a[href="/profile/${PROFILE_WITH_PHOTOS}"]:visible`)
		.first()
		.click();
	await profileLoaded(page);
	const profile = profileUrl(PROFILE_WITH_PHOTOS);

	await activeProfilePane(page)
		.getByRole("button", { name: "Profile menu" })
		.click();
	await expect(page.getByRole("menu")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("menu")).toHaveCount(0);
	await expect(page).toHaveURL(profile);

	await activeProfilePane(page)
		.locator(".carousel .item[href]")
		.first()
		.click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as { pswp?: { opener: { isOpen: boolean } } }).pswp
						?.opener.isOpen,
			),
		)
		.toBe(true);
	await page.keyboard.press("Escape");
	await expect(page.locator(LIGHTBOX)).toHaveCount(0);
	await expect(page).toHaveURL(profile);

	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(new RegExp(`${DEMO_CONVERSATION}$`));
});

test("Escape is left to a focused composer and closes the chat otherwise", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/chat");
	await page.locator('a[href^="/chat/"]').first().click();
	await expect(page).toHaveURL(/\/chat\/.+/);
	const composer = page.getByPlaceholder("Say something...");

	await composer.fill("draft");
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/\/chat\/.+/);
	await expect(composer).toHaveValue("draft");

	await composer.blur();
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/\/chat$/);
});

test("Escape cancels a pending reply before it closes the chat", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/chat");
	await page.locator(`a[href="${DEMO_CONVERSATION}"]`).first().click();
	await page
		.locator(MESSAGE_ROW)
		.filter({ hasText: "consectetur adipiscing elit" })
		.click({ button: "right" });
	await page.getByRole("button", { name: "Reply" }).click();
	const replyBar = page.getByLabel("Cancel reply");
	await expect(replyBar).toBeVisible();

	await page.getByPlaceholder("Say something...").blur();
	await page.keyboard.press("Escape");
	await expect(replyBar).toHaveCount(0);
	await expect(page).toHaveURL(new RegExp(`${DEMO_CONVERSATION}$`));

	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/\/chat$/);
});

test("Escape closes a settings page", async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/settings/app");
	await page.getByRole("link", { name: "Credits & Licenses" }).click();
	await expect(page).toHaveURL(/\/settings\/app\/credits$/);

	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/\/settings\/app$/);
});

test("Escape walks up a deep-linked settings page in place", async ({
	page,
}) => {
	await openDeepLink(page, CREDITS);

	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));

	expect(
		await historyEntries(page),
		"Escape replaced Credits with its parent",
	).toEqual({ index: 0, paths: [APP_SETTINGS] });
});
