import { expect, test } from "@playwright/test";

test("the root page renders in a plain browser, with no Tauri shim", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await expect(page.locator("nav a").first()).toBeVisible({
		timeout: 120_000,
	});
	await expect(page.locator("main")).toBeVisible({ timeout: 120_000 });
	expect(errors.join("\n")).not.toContain("preferences");
});
