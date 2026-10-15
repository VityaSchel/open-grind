import { expect, type Page, test } from "@playwright/test";

import {
	FIRST_ROUTE_COMPILE_MS,
	GRID_READY_SELECTOR,
	installTauriShim,
	openGrid,
} from "./support/app";
import { installPersistentAppData } from "./support/app-data";

const STORED_PREFERENCES_KEY = "e2e:appdata:preferences";
const UNDECODABLE_PREFERENCES = btoa(String.fromCharCode(0xc1));

const storedPreferencesBytes = (page: Page) =>
	page.evaluate((key) => localStorage.getItem(key), STORED_PREFERENCES_KEY);

function storePreferencesBytes({ page, bytes }: { page: Page; bytes: string }) {
	return page.evaluate(([key, value]) => localStorage.setItem(key, value), [
		STORED_PREFERENCES_KEY,
		bytes,
	] as const);
}

test("the grid offers a retry when saved preferences cannot be read", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await installTauriShim(page);
	await installPersistentAppData(page);
	await openGrid(page);
	const readable = await storedPreferencesBytes(page);
	if (readable === null) throw new Error("the grid saved no preferences");

	await storePreferencesBytes({ page, bytes: UNDECODABLE_PREFERENCES });
	await page.reload();

	const retry = page.getByRole("button", { name: "Try again" });
	await retry.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(page.getByText("Something went wrong")).toBeVisible();
	await expect(
		page.getByText("Couldn’t load app settings. Reset to defaults?"),
	).toBeVisible();
	expect(await page.locator(GRID_READY_SELECTOR).count()).toBe(0);

	await storePreferencesBytes({ page, bytes: readable });
	await retry.click();

	await page.locator(GRID_READY_SELECTOR).waitFor();
	await expect(retry).toBeHidden();
});
