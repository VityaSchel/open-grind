import { expect, test } from "@playwright/test";

import { openBrowse } from "./support/profile-pager";

test.describe.configure({ timeout: 180_000 });

test("the Tribes filter offers Trans while the session has no gender filter flag", async ({
	page,
}) => {
	await openBrowse(page);
	await page.getByRole("button", { name: "All filters" }).click();
	const filters = page.getByRole("dialog");
	await filters.getByRole("checkbox", { name: "Tribes" }).click();

	await expect(
		filters.getByRole("button", { name: "Bear", exact: true }),
	).toBeVisible();
	await expect(
		filters.getByRole("button", { name: "Trans", exact: true }),
	).toBeVisible();
});
