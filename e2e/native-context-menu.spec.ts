import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	ensureGridLocation,
	installTauriShim,
} from "./support/app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";

const DEMO_PROFILE = "/profile/100001";
const ABOUT_ME = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";

function nativeMenuCancelled(target: Locator): Promise<boolean> {
	return target.evaluate((element) => {
		const event = new MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
			button: 2,
		});
		element.dispatchEvent(event);
		return event.defaultPrevented;
	});
}

function selectText(target: Locator): Promise<void> {
	return target.evaluate((element) => {
		const range = document.createRange();
		range.selectNodeContents(element);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	});
}

async function openProfile(page: Page): Promise<void> {
	await page.goto(DEMO_PROFILE);
	await page.getByLabel("Profile menu").waitFor({ timeout: 120_000 });
}

test.beforeEach(async ({ page }) => {
	test.setTimeout(180_000);
	await serveImages(page, AVATAR_HOST);
	await serveImages(page, CHAT_MEDIA_HOST);
	await installTauriShim(page);
});

test("cancels the browser menu on a Browse profile link", async ({ page }) => {
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);
	const profileLink = page.locator('a[href^="/profile/"]').first();
	await profileLink.waitFor();

	expect(await nativeMenuCancelled(profileLink)).toBe(true);
});

test("cancels the browser menu on a profile photo", async ({ page }) => {
	await openProfile(page);
	const photo = page
		.getByRole("link", { name: /^Profile photo 1 of / })
		.locator("img")
		.first();
	await photo.waitFor();

	expect(await nativeMenuCancelled(photo)).toBe(true);
});

test("keeps the browser menu in the chat composer", async ({ page }) => {
	await page.goto(DEMO_CONVERSATION);
	const composer = page.getByRole("textbox");
	await composer.waitFor({ timeout: 60_000 });

	expect(await nativeMenuCancelled(composer)).toBe(false);
});

test("keeps the browser menu on selected About me text", async ({ page }) => {
	await openProfile(page);
	const aboutMe = page.getByText(ABOUT_ME);
	await aboutMe.waitFor();
	expect(await nativeMenuCancelled(aboutMe)).toBe(true);

	await selectText(aboutMe);

	expect(await nativeMenuCancelled(aboutMe)).toBe(false);
});

test("cancels the browser menu on the card around selected text", async ({
	page,
}) => {
	await openProfile(page);
	const aboutMe = page.getByText(ABOUT_ME);
	await aboutMe.waitFor();
	const card = page.locator('[data-slot="card"]').filter({ has: aboutMe });

	await selectText(aboutMe);

	expect(await nativeMenuCancelled(card)).toBe(true);
});

test.describe("on a wide window", () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test("right-clicking a conversation still opens its own menu", async ({
		page,
	}) => {
		await page.goto("/chat");
		const conversation = page.locator('a[href^="/chat/"]').first();
		await conversation.waitFor({ timeout: 60_000 });

		await conversation.click({ button: "right" });

		await expect(page.getByRole("menu")).toBeVisible();
		await expect(
			page.getByRole("menuitem", { name: /^(Pin|Unpin)$/ }),
		).toBeVisible();
	});
});
