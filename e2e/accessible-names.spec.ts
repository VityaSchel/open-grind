import { test } from "@playwright/test";

import { expectEveryControlNamed } from "./support/a11y";
import { DEMO_CONVERSATION, installTauriShim } from "./support/app";

const DEMO_PROFILE = "/profile/100001";
const DEMO_GEOHASH = "u33dc0cpgp00";
const MESSAGE = '[role="button"][tabindex="0"]';

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

test.describe("every control has an accessible name", () => {
	test("conversation and its composer", async ({ page }) => {
		await page.goto(DEMO_CONVERSATION);
		await page.locator(MESSAGE).first().waitFor({ timeout: 120_000 });
		await expectEveryControlNamed(page, "conversation");

		await page.locator('[aria-label="Add attachment"]').click();
		await page.locator('[aria-label="Add photo"]').waitFor();
		await expectEveryControlNamed(page, "attachments drawer");
		await page.keyboard.press("Escape");

		await page.getByRole("textbox").fill("hi");
		await page.locator("form button[type=submit]").waitFor();
		await expectEveryControlNamed(page, "composer with a draft");
	});

	test("conversations list, settings and profile", async ({ page }) => {
		await page.goto("/chat");
		await page.locator("a[href^='/chat/']").first().waitFor();
		await expectEveryControlNamed(page, "conversations list");

		await page.goto("/settings/profile");
		await page
			.getByRole("button", { name: /^Remove profile photo/ })
			.first()
			.waitFor();
		await expectEveryControlNamed(page, "edit profile");

		await page.goto(DEMO_PROFILE);
		await page.locator('[aria-label="Profile menu"]').waitFor();
		await expectEveryControlNamed(page, "profile");
	});

	test("grid and its filter sheets", async ({ page }) => {
		test.setTimeout(240_000);
		await page.goto("/");
		await page.locator("nav a").first().waitFor({ timeout: 120_000 });
		if ((await page.locator('[aria-label="All filters"]').count()) === 0) {
			await page.keyboard.press("Meta+k");
			const palette = page.getByRole("combobox");
			await palette.waitFor();
			await palette.fill(`@${DEMO_GEOHASH}`);
			await page
				.locator(`[role="option"][data-value="@${DEMO_GEOHASH}"]`)
				.waitFor();
			await page.keyboard.press("Enter");
		}
		const allFilters = page.locator('[aria-label="All filters"]');
		await allFilters.waitFor({ timeout: 60_000 });
		await expectEveryControlNamed(page, "grid");

		await allFilters.click();
		await page.getByRole("button", { name: "Apply" }).waitFor();
		await expectEveryControlNamed(page, "all filters");
		await page.keyboard.press("Escape");

		await page.getByRole("button", { name: "Age", exact: true }).click();
		await page.getByRole("slider", { name: "Minimum age" }).waitFor();
		await expectEveryControlNamed(page, "age filter");
		await page.keyboard.press("Escape");

		await page.locator('[aria-label="Change location"]').click();
		await page
			.getByPlaceholder("Search places...")
			.waitFor({ timeout: 120_000 });
		await page
			.getByRole("button", { name: "Selected location" })
			.waitFor({ timeout: 60_000 });
		await expectEveryControlNamed(page, "location picker");
	});
});
