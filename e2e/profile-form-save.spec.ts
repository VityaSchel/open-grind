import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const SAVE = "Save changes";

test("editing the profile arms the save button and saving disarms it", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await installTauriShim(page);
	await page.goto("/settings/profile");

	const displayName = page.getByPlaceholder(
		"Everyone will see this on the grid...",
	);
	await displayName.waitFor({ timeout: 60_000 });
	await expect(page.getByRole("button", { name: SAVE })).toHaveCount(0);

	await displayName.fill("Renamed in a test");
	const save = page.getByRole("button", { name: SAVE });
	await expect(save).toBeVisible();

	await save.click();

	await expect(page.getByText("Profile updated")).toBeVisible();
	await expect(save).toHaveCount(0);
	await expect(displayName).toHaveValue("Renamed in a test");
});
