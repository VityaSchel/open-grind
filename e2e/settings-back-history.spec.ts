import { expect, test } from "@playwright/test";

import { historyDepth, pathname } from "./support/app";
import {
	APP_SETTINGS,
	clickMeTab,
	clickNavBarBack,
	openAppSettings,
	openDeepLink,
	openSettings,
	SETTINGS,
	systemBack,
} from "./support/page-stack";

const ROUNDS = 3;

test.describe.configure({ timeout: 180_000 });

test("the navbar Back returns to the previous entry instead of pushing one", async ({
	page,
}) => {
	await openSettings(page);
	const atSettings = await historyDepth(page);

	await openAppSettings(page);
	const atAppSettings = await historyDepth(page);

	await clickNavBarBack(page);
	const afterBack = await historyDepth(page);

	expect(atAppSettings, "opening App Settings pushes one entry").toBe(
		atSettings + 1,
	);
	expect(
		afterBack,
		`history.length went ${atSettings} -> ${atAppSettings} -> ${afterBack}`,
	).toBe(atAppSettings);
	expect(
		await page.evaluate(() => navigation.canGoForward),
		"App Settings stays a forward entry",
	).toBe(true);
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
});

test("a system back after the navbar Back does not re-enter App Settings", async ({
	page,
}) => {
	await openSettings(page);
	await openAppSettings(page);
	await clickNavBarBack(page);

	const gesture = await systemBack(page);

	expect(
		await pathname(page),
		`system back (tracked: ${gesture.tracked}, handled in JS: ${gesture.handled}) landed here`,
	).not.toBe(APP_SETTINGS);
});

test("consecutive system backs keep walking out, never back in", async ({
	page,
}) => {
	await openSettings(page);
	await openAppSettings(page);

	const visited: string[] = [];
	for (let press = 0; press < ROUNDS; press++) {
		await systemBack(page);
		visited.push(await pathname(page));
	}

	expect(
		visited.filter((path) => path === APP_SETTINGS),
		`system back re-entered App Settings: ${visited.join(" -> ")}`,
	).toHaveLength(0);
});

test("navbar Back and system back do not oscillate with App Settings", async ({
	page,
}) => {
	await openSettings(page);
	const start = await historyDepth(page);
	const visited: string[] = [];
	const depths: number[] = [];

	for (let round = 0; round < ROUNDS; round++) {
		const at = await pathname(page);
		if (at === SETTINGS) await openAppSettings(page);
		else if (at !== APP_SETTINGS) break;

		await clickNavBarBack(page);
		visited.push(await pathname(page));
		await systemBack(page);
		visited.push(await pathname(page));
		depths.push(await historyDepth(page));
	}

	expect(
		visited.filter((path) => path === APP_SETTINGS),
		`system back walked deeper into settings: ${visited.join(" -> ")} (history.length ${start} -> ${depths.join(" -> ")})`,
	).toHaveLength(0);
	expect(
		visited.length,
		"no round ran, so nothing was asserted",
	).toBeGreaterThan(0);
	expect(
		Math.max(...depths) - start,
		`history.length grew ${start} -> ${depths.join(" -> ")}`,
	).toBeLessThanOrEqual(1);
});

test("the Me tab returns to the Me screen instead of pushing one", async ({
	page,
}) => {
	await openSettings(page);
	const atSettings = await historyDepth(page);

	await openAppSettings(page);
	const atAppSettings = await historyDepth(page);

	await clickMeTab(page);
	const afterTab = await historyDepth(page);

	expect(atAppSettings, "opening App Settings pushes one entry").toBe(
		atSettings + 1,
	);
	expect(
		afterTab,
		`history.length went ${atSettings} -> ${atAppSettings} -> ${afterTab}`,
	).toBe(atAppSettings);
	expect(
		await page.evaluate(() => navigation.canGoForward),
		"App Settings stays a forward entry",
	).toBe(true);
});

test("a round trip through the Me tab does not make back oscillate", async ({
	page,
}) => {
	await openSettings(page);
	const start = await historyDepth(page);

	await openAppSettings(page);
	await clickMeTab(page);
	await openAppSettings(page);
	const depth = await historyDepth(page);

	const visited: string[] = [];
	for (let press = 0; press < ROUNDS; press++) {
		await systemBack(page);
		visited.push(await pathname(page));
	}

	expect(
		depth,
		`history.length went ${start} -> ${depth} across App Settings, Me tab, App Settings`,
	).toBe(start + 1);
	expect(
		visited.filter((path) => path === APP_SETTINGS),
		`back re-entered App Settings: ${visited.join(" -> ")}`,
	).toHaveLength(0);
});

test("the Me tab collapses every entry between here and the Me screen", async ({
	page,
}) => {
	await openSettings(page);
	const atSettings = await historyDepth(page);

	await page.getByRole("link", { name: "Account Settings" }).click();
	await expect(page).toHaveURL(/\/settings\/account$/);
	await page.getByRole("link", { name: "Blocked users" }).click();
	await expect(page).toHaveURL(/\/settings\/account\/blocked$/);
	const atBlocked = await historyDepth(page);

	await clickMeTab(page);

	const after = await page.evaluate(() => ({
		index: navigation.currentEntry!.index,
		paths: navigation
			.entries()
			.map((entry) => (entry.url ? new URL(entry.url).pathname : "")),
		canGoForward: navigation.canGoForward,
	}));

	expect(atBlocked, "two pushes down the settings tree").toBe(atSettings + 2);
	expect(
		await historyDepth(page),
		`history.length went ${atSettings} -> ${atBlocked} -> ${await historyDepth(page)}`,
	).toBe(atBlocked);
	expect(after.paths[after.index], "landed on an existing Me entry").toBe(
		SETTINGS,
	);
	expect(
		after.paths.slice(after.index + 1),
		`both deeper entries stayed ahead: ${after.paths.join(" ")} @${after.index}`,
	).toEqual(["/settings/account", "/settings/account/blocked"]);
	expect(after.canGoForward, "it traversed rather than pushed").toBe(true);
});

test("the Me tab still navigates from a deep-linked subpage", async ({
	page,
}) => {
	await openDeepLink(page, APP_SETTINGS);

	await clickMeTab(page);

	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
});
