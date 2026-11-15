import { expect, test } from "@playwright/test";

import {
	captureInvokes,
	DEMO_GEOHASH,
	ensureGridLocation,
	installTauriShim,
	runPaletteCommand,
} from "./support/app";

const OPTION = '[role="option"]';
const OTHER_GEOHASH = "u33dc0cpgp0b";

test("the @ command copies the current location and still sets a new one", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);

	await page.keyboard.press("ControlOrMeta+k");
	const palette = page.getByRole("combobox");
	await palette.waitFor();

	await palette.fill("@");
	await expect(page.locator(OPTION)).toHaveText([
		`Copy currently selected location: ${DEMO_GEOHASH}`,
	]);
	await expect(page.locator(OPTION)).toHaveAttribute("data-selected", "");

	// a typed geohash must replace the copy item, not pile up next to it
	await palette.fill(`@${DEMO_GEOHASH}`);
	await expect(page.locator(OPTION)).toHaveText([`@${DEMO_GEOHASH}`]);
	await expect(page.locator(OPTION)).toHaveAttribute("data-selected", "");

	await palette.fill("@");
	await expect(page.locator(OPTION)).toHaveText([
		`Copy currently selected location: ${DEMO_GEOHASH}`,
	]);
	await expect(page.locator(OPTION)).toHaveAttribute("data-selected", "");

	await page.keyboard.press("Enter");
	await expect(palette).toHaveCount(0);
	await expect(
		page.getByText("Location copied to clipboard", { exact: true }).first(),
	).toBeVisible();

	// copying is not a mutation: the location is still the one we copied
	await page.keyboard.press("ControlOrMeta+k");
	await palette.waitFor();
	await palette.fill("@");
	await expect(page.locator(OPTION)).toHaveText([
		`Copy currently selected location: ${DEMO_GEOHASH}`,
	]);
});

test("a palette command runs once per Enter", async ({ page }) => {
	test.setTimeout(240_000);
	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);
	const writes = await captureInvokes(page, "write_app_data");
	const copies = await captureInvokes(
		page,
		"plugin:clipboard-manager|write_text",
	);

	await runPaletteCommand(page, `@${OTHER_GEOHASH}`);
	const palette = page.getByRole("combobox");
	await palette.waitFor({ state: "detached" });

	await page.keyboard.press("ControlOrMeta+k");
	await palette.fill("@");
	await expect(page.locator(OPTION)).toHaveText([
		`Copy currently selected location: ${OTHER_GEOHASH}`,
	]);
	await expect(page.locator(OPTION)).toHaveAttribute("data-selected", "");
	await page.keyboard.press("Enter");
	await expect(
		page.getByText("Location copied to clipboard").first(),
	).toBeVisible();

	const preferenceWrites = (await writes()).filter(
		(args) => (args as { file: string }).file === "preferences",
	);
	expect(preferenceWrites).toHaveLength(1);
	expect(await copies()).toEqual([{ text: OTHER_GEOHASH }]);
});
