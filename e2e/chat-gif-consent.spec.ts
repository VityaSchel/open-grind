import { expect, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./support/app";
import { seedPreferences, storedPreferences } from "./support/app-data";

async function openChatWithGiphy(page: Page, { on }: { on: boolean }) {
	await installTauriShim(page);
	await seedPreferences(page, { preferences: { giphyConsent: on } });
	await page.goto(DEMO_CONVERSATION);
}

function receivedGif(page: Page) {
	return page.locator('[data-slot="giphy-message"]').first();
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
