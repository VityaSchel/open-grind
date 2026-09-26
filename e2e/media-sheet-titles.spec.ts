import { expect, type Locator, test } from "@playwright/test";

import { openSharedAlbum } from "./support/albums";
import { openAttachments } from "./support/drawer";

async function shownOnScreen(locator: Locator): Promise<boolean> {
	const box = await locator.boundingBox();
	if (!box) throw new Error("Nothing to measure");
	return box.width > 1 && box.height > 1;
}

test.describe("media sheet titles", () => {
	test("the album's previous uploads sheet is titled Previous uploads", async ({
		page,
	}) => {
		await openSharedAlbum(page);
		await page
			.getByRole("button", { name: "Add photos or videos" })
			.click();

		const sheet = page.getByRole("dialog", { name: "Previous uploads" });
		await expect(sheet).toBeVisible();
		expect(
			await shownOnScreen(
				sheet.getByRole("heading", { name: "Previous uploads" }),
			),
			"the title is shown on the sheet",
		).toBe(true);
	});

	test("the chat attachments sheet is named Attachments for screen readers only", async ({
		page,
	}) => {
		await openAttachments(page);

		const sheet = page.getByRole("dialog", { name: "Attachments" });
		await expect(sheet).toBeVisible();
		expect(
			await shownOnScreen(
				sheet.getByRole("heading", { name: "Attachments" }),
			),
			"the tab bar labels the sheet, so its title stays off screen",
		).toBe(false);
	});
});
