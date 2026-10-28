import { expect, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import { PSEUDO_MESSAGE } from "../src/lib/i18n/fixtures/pseudo-message";
import { FIRST_ROUTE_COMPILE_MS } from "./support/app";
import { APP_SETTINGS } from "./support/page-stack";
import { showRestingToast } from "./support/toast";

test.use({ baseURL: DEV_SERVER_URL });

const LANGUAGE_PAGE = `${APP_SETTINGS}/language`;
const HOTKEY = "Alt+T";
const TOAST_LABEL = "Region probe";
const TOAST_GONE_MS = 15_000;

test.describe.configure({ timeout: 180_000 });

const pseudoAccents = (page: Page) =>
	page.getByRole("radio", {
		name: "English (Pseudo-Accents) English (Pseudo-Accents)",
		exact: true,
	});

async function openLanguagePage(page: Page): Promise<void> {
	await page.goto(LANGUAGE_PAGE);
	await pseudoAccents(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await page.mouse.move(0, 0);
}

async function expectRegionThroughAToast(
	page: Page,
	{ name }: { name: string | RegExp },
): Promise<void> {
	const region = page.getByRole("region", { name, exact: true });
	await expect(region).toHaveAttribute("aria-keyshortcuts", HOTKEY);
	const toast = await showRestingToast({
		page,
		edge: "bottom",
		label: TOAST_LABEL,
	});
	await expect(region).toHaveAttribute("aria-keyshortcuts", HOTKEY);
	await expect(toast).toHaveCount(0, { timeout: TOAST_GONE_MS });
	await expect(region).toHaveAttribute("aria-keyshortcuts", HOTKEY);
}

test("names the toast region in the UI language with its hotkey kept apart", async ({
	page,
}) => {
	await openLanguagePage(page);
	await expectRegionThroughAToast(page, { name: "Notifications" });

	await pseudoAccents(page).click();
	await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
	await page.mouse.move(0, 0);
	await expectRegionThroughAToast(page, { name: PSEUDO_MESSAGE });
});

test("focuses the toaster on its hotkey", async ({ page }) => {
	await openLanguagePage(page);
	await showRestingToast({ page, edge: "bottom", label: TOAST_LABEL });

	await page.keyboard.press("Alt+KeyT");

	await expect(page.locator("[data-sonner-toaster]")).toBeFocused();
});
