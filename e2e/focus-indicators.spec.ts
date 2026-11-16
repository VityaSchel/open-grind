import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	commandCenterShortcut,
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	openGrid,
} from "./support/app";
import { focusProblems, tabThrough } from "./support/focus";

const STOPS = 30;

type Screen = {
	name: string;
	path: string;
	ready: (page: Page) => Locator;
	minStops: number;
};

type Overlay = {
	name: string;
	open: (page: Page) => Promise<void>;
	key?: string;
	minStops: number;
};

const navLink = (page: Page) => page.locator("nav a");

const SCREENS: Screen[] = [
	{
		name: "the inbox",
		path: "/chat",
		ready: (page) => page.locator("a[href^='/chat/']"),
		minStops: 20,
	},
	{
		name: "a conversation",
		path: DEMO_CONVERSATION,
		ready: (page) => page.getByRole("article"),
		minStops: 25,
	},
	{
		name: "a profile",
		path: "/profile/100001",
		ready: (page) => page.getByRole("button", { name: "Profile menu" }),
		minStops: 8,
	},
	{ name: "Taps", path: "/interest/taps", ready: navLink, minStops: 10 },
	{ name: "Views", path: "/interest/views", ready: navLink, minStops: 10 },
	{ name: "Me", path: "/settings", ready: navLink, minStops: 10 },
	{
		name: "the profile editor",
		path: "/settings/profile",
		ready: navLink,
		minStops: 20,
	},
	{
		name: "the blocked list",
		path: "/settings/account/blocked",
		ready: navLink,
		minStops: 20,
	},
	{
		name: "My Albums",
		path: "/settings/albums",
		ready: navLink,
		minStops: 5,
	},
	{
		name: "App Settings",
		path: "/settings/app",
		ready: navLink,
		minStops: 8,
	},
];

async function pressEnterOn(trigger: Locator, ready: Locator): Promise<void> {
	await trigger.focus();
	await trigger.page().keyboard.press("Enter");
	await ready.waitFor();
}

async function enterDrawer(page: Page): Promise<void> {
	await page.keyboard.press("Tab");
}

async function waitForFocusIn(dialog: Locator): Promise<void> {
	await expect
		.poll(() =>
			dialog.evaluate((node) => node.contains(document.activeElement)),
		)
		.toBe(true);
}

const OVERLAYS: Overlay[] = [
	{
		name: "the command center",
		open: async (page) => {
			await page.keyboard.press(await commandCenterShortcut(page));
			await page.getByRole("combobox").waitFor();
		},
		minStops: 1,
	},
	{
		name: "all filters",
		open: async (page) => {
			await pressEnterOn(
				page.getByRole("button", { name: "All filters" }),
				page.getByRole("button", { name: "Apply" }),
			);
			await waitForFocusIn(page.getByRole("dialog"));
		},
		minStops: 15,
	},
	{
		name: "the age filter",
		open: async (page) => {
			await pressEnterOn(
				page.getByRole("button", { name: "Age", exact: true }),
				page.getByRole("slider", { name: "Minimum Age" }),
			);
			await enterDrawer(page);
		},
		minStops: 4,
	},
	{
		name: "the location picker",
		open: async (page) => {
			await pressEnterOn(
				page.getByRole("button", { name: "Change location" }),
				page.getByPlaceholder("Search places…"),
			);
			await waitForFocusIn(page.getByRole("dialog"));
		},
		minStops: 4,
	},
];

test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false });
test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

test.describe("keyboard focus stays visible and unclipped", () => {
	test("on the browse grid", async ({ page }) => {
		await openGrid(page);
		const stops = await tabThrough(page, { stops: STOPS });
		expect(stops.length).toBe(STOPS);
		expect(focusProblems(stops)).toEqual([]);
	});

	for (const { name, path, ready, minStops } of SCREENS) {
		test(`on ${name}`, async ({ page }) => {
			await page.goto(path);
			await ready(page)
				.first()
				.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
			const stops = await tabThrough(page, { stops: STOPS });
			expect(stops.length).toBeGreaterThanOrEqual(minStops);
			expect(focusProblems(stops)).toEqual([]);
		});
	}

	for (const { name, open, key, minStops } of OVERLAYS) {
		test(`in ${name}`, async ({ page }) => {
			await openGrid(page);
			await open(page);
			const stops = await tabThrough(page, {
				stops: STOPS,
				key,
				fromCurrentFocus: true,
			});
			expect(stops.length).toBeGreaterThanOrEqual(minStops);
			expect(focusProblems(stops)).toEqual([]);
		});
	}

	test.describe("at phone width", () => {
		test.use({ viewport: { width: 420, height: 800 } });

		test("on the inbox filter chips", async ({ page }) => {
			await page.goto("/chat");
			await page
				.locator("a[href^='/chat/']")
				.first()
				.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
			const stops = await tabThrough(page, { stops: STOPS });
			expect(stops.length).toBeGreaterThanOrEqual(20);
			expect(focusProblems(stops)).toEqual([]);
		});

		test("in all filters", async ({ page }) => {
			await openGrid(page);
			await pressEnterOn(
				page.getByRole("button", { name: "All filters" }),
				page.getByRole("button", { name: "Apply" }),
			);
			await waitForFocusIn(page.getByRole("dialog"));
			const stops = await tabThrough(page, {
				stops: STOPS,
				fromCurrentFocus: true,
			});
			expect(stops.length).toBeGreaterThanOrEqual(20);
			expect(focusProblems(stops)).toEqual([]);
		});
	});

	test("in the profile menu", async ({ page }) => {
		await page.goto("/profile/100001");
		const menuButton = page.getByRole("button", { name: "Profile menu" });
		await menuButton.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await pressEnterOn(menuButton, page.getByRole("menu"));
		await waitForFocusIn(page.getByRole("menu"));
		const stops = await tabThrough(page, {
			stops: STOPS,
			key: "ArrowDown",
			fromCurrentFocus: true,
		});
		expect(stops.length).toBeGreaterThanOrEqual(3);
		expect(focusProblems(stops)).toEqual([]);
	});
});
