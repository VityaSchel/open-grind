import { expect, type Page } from "@playwright/test";

import { installTauriShim } from "./app";

export const SETTINGS = "/settings";
export const APP_SETTINGS = "/settings/app";
export const FIRST_ROUTE_COMPILE_MS = 120_000;

export const pane = (page: Page) =>
	page.locator('[data-slot="page-stack-pane"]');
export const dim = (page: Page) => page.locator('[data-slot="page-stack-dim"]');
export const ghost = (page: Page) =>
	page.locator('[data-slot="page-stack-ghost"]');
export const backLink = (page: Page) =>
	page.getByRole("link", { name: "Back", exact: true });
export const meTab = (page: Page) => page.getByRole("link", { name: "Me" });

export const pathname = (page: Page) => page.evaluate(() => location.pathname);
export const historyDepth = (page: Page) => page.evaluate(() => history.length);

export async function openSettings(page: Page, reducedMotion?: "reduce") {
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

export async function startSystemBack(page: Page) {
	return page.evaluate(() => {
		const state = window as unknown as { __backProgress: number };
		state.__backProgress = 0;
		window.__AndroidBack = {
			moveTaskToBack: () => {},
			gestureProgress: () => state.__backProgress,
		};
		return window.__AndroidOnBackGestureStart?.() ?? false;
	});
}

export async function progressSystemBack(page: Page, progress: number) {
	await page.evaluate((value) => {
		(window as unknown as { __backProgress: number }).__backProgress =
			value;
	}, progress);
	await page.waitForTimeout(48);
}

export const commitSystemBack = (page: Page) =>
	page.evaluate(() => window.__AndroidOnBackGesture?.());

export const cancelSystemBack = (page: Page) =>
	page.evaluate(() => window.__AndroidOnBackGestureCancel?.());

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
