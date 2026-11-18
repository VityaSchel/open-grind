import { expect, type Page } from "@playwright/test";

import type { SupportedPlatform } from "../../src/lib/platform/os";
import { isWithin } from "../../src/lib/util/pathname";
import { pushedFromChain } from "../../src/routes/(protected)/(navbar)/settings/page-stack/hierarchy";
import {
	backLink,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	meTab,
	watchRendered,
} from "./app";
import {
	commitSystemBack,
	progressSystemBack,
	startSystemBack,
} from "./system-back";

export const SETTINGS = "/settings";
export const APP_SETTINGS = "/settings/app";
export const CREDITS = `${APP_SETTINGS}/credits`;

export const STACK_PANE = '[data-slot="page-stack-pane"]';
export const STACK_DIM = '[data-slot="page-stack-dim"]';
export const STACK_GHOST = '[data-slot="page-stack-ghost"]';

export const SCREEN_HOST = '[data-slot="screen-stack-host"]';
export const SCREEN_DIM = '[data-slot="screen-stack-dim"]';
export const SCREEN_GHOST = '[data-slot="screen-ghost"]';
export const OUTSIDE_SCREEN_GHOSTS = `:not(${SCREEN_GHOST} *)`;

export const pane = (page: Page) => page.locator(STACK_PANE);
export const dim = (page: Page) => page.locator(STACK_DIM);
export const ghost = (page: Page) => page.locator(STACK_GHOST);
export const screenGhost = (page: Page) => page.locator(SCREEN_GHOST);

export const stackSettled = (page: Page) =>
	expect(dim(page)).toHaveCount(0, { timeout: 5_000 });

export const screenSettled = (page: Page) =>
	expect(page.locator(SCREEN_DIM)).toHaveCount(0, { timeout: 5_000 });

export async function openSettings(
	page: Page,
	{
		reducedMotion,
		platform,
	}: { reducedMotion?: "reduce"; platform: SupportedPlatform },
) {
	if (reducedMotion) await page.emulateMedia({ reducedMotion });
	await installTauriShim(page, { platform });
	await page.goto(SETTINGS);
	await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await page
		.getByRole("link", { name: "App Settings" })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

export async function openDeepLink(
	page: Page,
	{ path, platform }: { path: string; platform: SupportedPlatform },
) {
	await installTauriShim(page, { platform });
	await page.goto(path);
	await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await stackSettled(page);
}

export async function openAppSettings(page: Page) {
	await page.getByRole("link", { name: "App Settings" }).click();
	await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
	await stackSettled(page);
}

export async function openCredits(page: Page) {
	await page.getByRole("link", { name: "Credits & Licenses" }).click();
	await expect(page).toHaveURL(new RegExp(`${CREDITS}$`));
	await stackSettled(page);
}

export const APP_SUBSCREENS = [
	{ row: "Display", path: `${APP_SETTINGS}/display` },
	{ row: "Notifications", path: `${APP_SETTINGS}/notifications` },
	{ row: "Privacy", path: `${APP_SETTINGS}/privacy` },
	{ row: "Security", path: `${APP_SETTINGS}/security` },
];

export async function openAppSubscreen(
	page: Page,
	{ row, path }: { row: string; path: string },
) {
	await page.getByRole("link", { name: row, exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`${path}$`));
	await stackSettled(page);
}

const currentEntry = (page: Page) =>
	page.evaluate(() => navigation.currentEntry!.id);

async function watchLeaving(page: Page) {
	await stackSettled(page);
	await screenSettled(page);
	const from = await page.evaluate((host) => {
		const { id, index } = navigation.currentEntry!;
		return {
			entry: id,
			pathname: location.pathname,
			reducedMotion: matchMedia("(prefers-reduced-motion: reduce)")
				.matches,
			pictureBehind: document.querySelector(host) !== null,
			earlier: navigation
				.entries()
				.slice(0, index)
				.reverse()
				.map(({ url }) => (url ? new URL(url).pathname : null)),
		};
	}, SCREEN_HOST);
	const slid = await watchRendered(page, { selector: STACK_DIM });
	const slidOverPicture = await watchRendered(page, { selector: SCREEN_DIM });
	const slidesBackOnto = (destination: string | null | undefined) =>
		!from.reducedMotion &&
		isWithin({ pathname: from.pathname, root: SETTINGS }) &&
		pushedFromChain(from).some(({ path }) => path === destination);

	return {
		canGoBack: from.earlier.length > 0,
		previous: from.earlier[0],
		landed: async ({
			onto,
			tracked = false,
		}: {
			onto: string | null | undefined;
			tracked?: boolean;
		}) => {
			await expect
				.poll(() => currentEntry(page), {
					message: `leaves ${from.pathname}`,
				})
				.not.toBe(from.entry);
			if (slidesBackOnto(onto))
				await expect
					.poll(slid, {
						message: `${from.pathname} slides off the stack onto ${onto}`,
					})
					.toBe(true);
			else if (tracked && from.pictureBehind)
				await expect
					.poll(slidOverPicture, {
						message: `${from.pathname} slides off over a picture of ${onto}`,
					})
					.toBe(true);
			await stackSettled(page);
			await screenSettled(page);
		},
	};
}

export async function clickMeTab(page: Page) {
	const leaving = await watchLeaving(page);
	await meTab(page).click();
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
	await leaving.landed({ onto: SETTINGS });
}

export async function clickNavBarBack(page: Page) {
	const leaving = await watchLeaving(page);
	const parent = await backLink(page).getAttribute("href");
	await backLink(page).click();
	await leaving.landed({ onto: leaving.previous });
	await expect(
		backLink(page).and(page.locator(`[href="${parent}"]`)),
		`the Back to ${parent} is gone with its page`,
	).toHaveCount(0);
}

const webViewGoBack = (page: Page) =>
	page.evaluate(() => {
		if (navigation.canGoBack) history.back();
	});

export async function systemBack(page: Page) {
	const leaving = await watchLeaving(page);
	const tracked = await startSystemBack(page);
	if (tracked) {
		await progressSystemBack(page, 0.3);
		await progressSystemBack(page, 0.9);
	}

	const handled = (await commitSystemBack(page)) === false;
	if (!handled) await webViewGoBack(page);
	if (leaving.canGoBack && (tracked || !handled))
		await leaving.landed({ onto: leaving.previous, tracked });
	else {
		await stackSettled(page);
		await screenSettled(page);
	}
	return { tracked, handled };
}
