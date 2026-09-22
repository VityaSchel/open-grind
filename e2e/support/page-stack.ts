import { expect, type Page } from "@playwright/test";

import {
	backLink,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	meTab,
} from "./app";
import {
	commitSystemBack,
	progressSystemBack,
	startSystemBack,
} from "./system-back";

export const SETTINGS = "/settings";
export const APP_SETTINGS = "/settings/app";

export const pane = (page: Page) =>
	page.locator('[data-slot="page-stack-pane"]');
export const dim = (page: Page) => page.locator('[data-slot="page-stack-dim"]');
export const ghost = (page: Page) =>
	page.locator('[data-slot="page-stack-ghost"]');

export async function openSettings(
	page: Page,
	{ reducedMotion }: { reducedMotion?: "reduce" } = {},
) {
	if (reducedMotion) await page.emulateMedia({ reducedMotion });
	await installTauriShim(page);
	await page.goto(SETTINGS);
	await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await page
		.getByRole("link", { name: "App Settings" })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

export async function openDeepLink(page: Page, path: string) {
	await installTauriShim(page);
	await page.goto(path);
	await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
}

export async function openAppSettings(page: Page) {
	await page.getByRole("link", { name: "App Settings" }).click();
	await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
}

export async function clickMeTab(page: Page) {
	await meTab(page).click();
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
}

export async function clickNavBarBack(page: Page) {
	await backLink(page).click();
	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
}

const webViewGoBack = (page: Page) => page.evaluate(() => history.back());

export async function systemBack(page: Page) {
	const tracked = await startSystemBack(page);
	if (tracked) {
		await progressSystemBack(page, 0.3);
		await progressSystemBack(page, 0.9);
	}

	const handled = (await commitSystemBack(page)) === false;
	if (!handled) await webViewGoBack(page);
	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
	return { tracked, handled };
}
