import { expect, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./support/app";
import { seedPreferences, storedPreferences } from "./support/app-data";
import { GIPHY_MESSAGE } from "./support/stickers";

async function openChatWithGiphy(page: Page, { on }: { on: boolean }) {
	await installTauriShim(page);
	await seedPreferences(page, { preferences: { giphyConsent: on } });
	await page.goto(DEMO_CONVERSATION);
}

function receivedGif(page: Page) {
	return page.locator(GIPHY_MESSAGE).first();
}

function lightboxImage(page: Page) {
	return page.locator(".pswp .pswp__item[aria-hidden=false] img").last();
}

async function askToLoad(page: Page) {
	const tile = receivedGif(page).getByRole("button", { name: /Tap to load/ });
	await tile.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await tile.focus();
	await page.keyboard.press("Enter");
	const dialog = page.getByRole("alertdialog");
	await expect(dialog).toBeVisible();
	return { tile, dialog };
}

test("a received GIF waits behind a tap until GIPHY is on", async ({
	page,
}) => {
	await openChatWithGiphy(page, { on: false });

	const { dialog } = await askToLoad(page);

	await expect(dialog.getByText("Enable GIPHY?")).toBeVisible();
	await expect(
		dialog.getByRole("link", { name: "Privacy Policy" }),
	).toBeVisible();
	await expect(receivedGif(page).getByRole("img")).toHaveCount(0);
});

test("Continue turns GIPHY on and plays the GIF with focus on it", async ({
	page,
}) => {
	await openChatWithGiphy(page, { on: false });
	const { dialog } = await askToLoad(page);

	await dialog.getByRole("button", { name: "Continue" }).click();

	await expect(dialog).toHaveCount(0);
	await expect(
		receivedGif(page).getByRole("img", { name: "GIF" }),
	).toHaveJSProperty("complete", true);
	await expect(
		receivedGif(page).getByRole("link", { name: "GIF" }),
	).toBeFocused();
	await expect
		.poll(async () => (await storedPreferences(page))?.giphyConsent)
		.toBe(true);
});

test("Cancel and Escape leave the GIF unloaded and GIPHY off", async ({
	page,
}) => {
	await openChatWithGiphy(page, { on: false });

	const { tile, dialog } = await askToLoad(page);
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toHaveCount(0);
	await expect(tile).toBeFocused();

	await askToLoad(page);
	await page.keyboard.press("Escape");
	await expect(page.getByRole("alertdialog")).toHaveCount(0);

	await expect(receivedGif(page).getByRole("img")).toHaveCount(0);
	expect((await storedPreferences(page))?.giphyConsent).toBe(false);
});

test("with GIPHY on, a received GIF plays without asking", async ({ page }) => {
	await openChatWithGiphy(page, { on: true });

	await expect(
		receivedGif(page).getByRole("img", { name: "GIF" }),
	).toHaveJSProperty("complete", true, { timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(
		receivedGif(page).getByRole("button", { name: /Tap to load/ }),
	).toHaveCount(0);
});

test("with reduced motion a GIF holds still with a badge and opens in the lightbox", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await openChatWithGiphy(page, { on: true });
	const gif = receivedGif(page);

	await expect(gif.locator('[data-slot="gif-badge"]')).toHaveText("GIF", {
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	await gif.getByRole("link", { name: "GIF" }).click();
	await expect(lightboxImage(page)).toBeVisible();
});

test("a GIF in the chat opens to fill the screen in the photo lightbox", async ({
	page,
}) => {
	await openChatWithGiphy(page, { on: true });
	const gif = receivedGif(page);
	await expect(gif.getByRole("img", { name: "GIF" })).toHaveJSProperty(
		"complete",
		true,
		{ timeout: FIRST_ROUTE_COMPILE_MS },
	);

	await gif.getByRole("link", { name: "GIF" }).click();

	const shown = lightboxImage(page);
	await expect(shown).toBeVisible();
	const viewport = page.viewportSize()!;
	await expect
		.poll(async () => {
			const box = await shown.boundingBox();
			return Math.max(
				(box?.width ?? 0) / viewport.width,
				(box?.height ?? 0) / viewport.height,
			);
		})
		.toBeGreaterThan(0.95);
});
