import { expect, test } from "@playwright/test";

import { ensureGridLocation, installTauriShim } from "./support/app";

const MESSAGE = '[role="button"][tabindex="0"]';

test("grid tile opens a profile, which opens a conversation that accepts a message", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);

	const tile = page.locator('a[href^="/profile/"]').first();
	await tile.waitFor({ timeout: 60_000 });
	await tile.click();
	await expect(page).toHaveURL(/\/profile\/\d+$/);

	await page
		.getByRole("link", { name: "Write a message..." })
		.click({ timeout: 60_000 });
	await expect(page).toHaveURL(/\/chat\/\d+:\d+$/);

	const sent = "smoke test message";
	const composer = page.getByRole("textbox");
	await composer.waitFor({ timeout: 60_000 });
	await composer.fill(sent);
	await page.locator("form button[type=submit]").click();

	await expect(page.locator(MESSAGE).last()).toContainText(sent);
	await expect(composer).toHaveValue("");
	await expect(page.getByText("Sending...")).toHaveCount(0);
	await expect(page.getByText("Failed to send")).toHaveCount(0);
});
