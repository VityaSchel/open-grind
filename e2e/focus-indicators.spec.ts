import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	animationsFinished,
	commandCenterShortcut,
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	openGrid,
} from "./support/app";
import {
	arrowThrough,
	focusProblems,
	type FocusStop,
	tabCycle,
	tabThrough,
	walkFocus,
} from "./support/focus";

const STOPS = 30;
const ARROW_STOPS = 8;

type Screen = {
	name: string;
	path: string;
	ready: (page: Page) => Locator;
	minStops: number;
};

type ArrowKey = "ArrowDown" | "ArrowUp" | "ArrowRight";

type Composite = {
	name: string;
	within: (page: Page) => Locator;
	key: ArrowKey;
};

type CompositeScreen = {
	name: string;
	open: (page: Page) => Promise<unknown>;
	ready: (page: Page) => Locator;
	composites: Composite[];
	maxStops: number;
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
		name: "a profile",
		path: "/profile/100001",
		ready: (page) => page.getByRole("button", { name: "Profile menu" }),
		minStops: 8,
	},
	{
		name: "the profile editor",
		path: "/settings/profile",
		ready: navLink,
		minStops: 20,
	},
];

const NAV_BAR: Composite = {
	name: "the NavBar",
	within: (page) => page.getByRole("toolbar", { name: "Sections" }),
	key: "ArrowRight",
};
const INBOX_FILTERS: Composite = {
	name: "the inbox filters",
	within: (page) =>
		page.getByRole("toolbar", { name: "Conversation filters" }),
	key: "ArrowRight",
};

const COMPOSITE_SCREENS: CompositeScreen[] = [
	{
		name: "the browse grid",
		open: openGrid,
		ready: (page) =>
			page.locator('[data-slot="grid-cells"] a[href^="/profile/"]'),
		composites: [
			{
				name: "the quick filters",
				within: (page) =>
					page.getByRole("toolbar", { name: "Quick filters" }),
				key: "ArrowRight",
			},
			{
				name: "the grid",
				within: (page) => page.locator('[data-slot="grid-cells"]'),
				key: "ArrowRight",
			},
			NAV_BAR,
		],
		maxStops: 4,
	},
	{
		name: "the inbox",
		open: (page) => page.goto("/chat"),
		ready: (page) => page.locator("a[href^='/chat/']"),
		composites: [
			INBOX_FILTERS,
			{
				name: "the conversations",
				within: (page) =>
					page.locator('[data-slot="conversations-scroller"]'),
				key: "ArrowDown",
			},
			NAV_BAR,
		],
		maxStops: 5,
	},
	{
		name: "a conversation",
		open: (page) => page.goto(DEMO_CONVERSATION),
		ready: (page) => page.getByRole("article"),
		composites: [
			{
				name: "the messages",
				within: (page) =>
					page.locator('[data-slot="messages-scroller"]'),
				key: "ArrowUp",
			},
		],
		maxStops: 14,
	},
	{
		name: "Taps",
		open: (page) => page.goto("/interest/taps"),
		ready: (page) => page.locator('[data-slot="taps-scroller"] a'),
		composites: [
			{
				name: "the taps",
				within: (page) => page.locator('[data-slot="taps-scroller"]'),
				key: "ArrowDown",
			},
			NAV_BAR,
		],
		maxStops: 4,
	},
	{
		name: "Views",
		open: (page) => page.goto("/interest/views"),
		ready: (page) => page.locator('[data-slot="views-scroller"] a'),
		composites: [
			{
				name: "the views",
				within: (page) => page.locator('[data-slot="views-scroller"]'),
				key: "ArrowRight",
			},
			NAV_BAR,
		],
		maxStops: 4,
	},
	{
		name: "Me",
		open: (page) => page.goto("/settings"),
		ready: (page) => page.locator('[data-slot="me-scroller"] a'),
		composites: [
			{
				name: "the settings",
				within: (page) => page.locator('[data-slot="me-scroller"]'),
				key: "ArrowDown",
			},
			NAV_BAR,
		],
		maxStops: 3,
	},
	{
		name: "the blocked list",
		open: (page) => page.goto("/settings/account/blocked"),
		ready: (page) => page.getByRole("switch"),
		composites: [
			{
				name: "the blocked profiles",
				within: (page) =>
					page.locator('[data-slot="profile-list-rows"]'),
				key: "ArrowDown",
			},
			NAV_BAR,
		],
		maxStops: 4,
	},
	{
		name: "My Albums",
		open: (page) => page.goto("/settings/albums"),
		ready: (page) => page.locator('[data-slot="album-tile"]'),
		composites: [
			{
				name: "the albums",
				within: (page) =>
					page.locator('[data-slot="subpage-scroller"]'),
				key: "ArrowRight",
			},
			NAV_BAR,
		],
		maxStops: 4,
	},
	{
		name: "App Settings",
		open: (page) => page.goto("/settings/app"),
		ready: (page) => page.locator('[data-slot="subpage-scroller"] a'),
		composites: [
			{
				name: "the settings",
				within: (page) =>
					page.locator('[data-slot="subpage-scroller"]'),
				key: "ArrowDown",
			},
			NAV_BAR,
		],
		maxStops: 4,
	},
];

async function expectOneStopPerComposite({
	page,
	composites,
	maxStops,
}: {
	page: Page;
	composites: Composite[];
	maxStops: number;
}): Promise<void> {
	const compositeStops: string[] = [];
	const stops = await tabCycle(page, {
		limit: STOPS,
		onStop: async () => {
			for (const { name, within } of composites) {
				const inside = await within(page).evaluate((node) =>
					node.contains(document.activeElement),
				);
				if (inside) compositeStops.push(name);
			}
		},
	});
	expect(compositeStops, "Tab crosses each composite once, in order").toEqual(
		composites.map(({ name }) => name),
	);
	expect(stops.length).toBeLessThanOrEqual(maxStops);
	expect(focusProblems(stops)).toEqual([]);
	for (const { within, key } of composites) {
		const arrows = await arrowThrough(page, {
			start: within(page).locator('[tabindex="0"]').first(),
			key,
			stops: ARROW_STOPS,
		});
		expect(arrows.length).toBeGreaterThan(1);
		expect(focusProblems(arrows)).toEqual([]);
	}
}

async function pressEnterOn({
	trigger,
	ready,
}: {
	trigger: Locator;
	ready: Locator;
}): Promise<void> {
	await trigger.focus();
	await trigger.page().keyboard.press("Enter");
	await ready.waitFor();
}

async function tabThroughOverlay(
	page: Page,
	{ key }: { key?: string } = {},
): Promise<FocusStop[]> {
	const overlay = page.getByRole("dialog");
	return walkFocus(page, {
		key: key ?? "Tab",
		stops: STOPS,
		from: "currentFocus",
		whenLost: "report",
		onStop: async () => {
			expect(
				await overlay.evaluate((node) =>
					node.contains(document.activeElement),
				),
				"Tab stays in the overlay",
			).toBe(true);
		},
	});
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
			await pressEnterOn({
				trigger: page.getByRole("button", { name: "All filters" }),
				ready: page.getByRole("button", { name: "Apply" }),
			});
			await waitForFocusIn(page.getByRole("dialog"));
		},
		minStops: 15,
	},
	{
		name: "the age filter",
		open: async (page) => {
			await pressEnterOn({
				trigger: page.getByRole("button", { name: "Age", exact: true }),
				ready: page.getByRole("slider", { name: "Minimum Age" }),
			});
			const drawer = page.getByRole("dialog");
			await waitForFocusIn(drawer);
			await animationsFinished(drawer);
		},
		minStops: 4,
	},
	{
		name: "the location picker",
		open: async (page) => {
			await pressEnterOn({
				trigger: page.getByRole("button", { name: "Change location" }),
				ready: page.getByPlaceholder("Search places…"),
			});
			await waitForFocusIn(page.getByRole("dialog"));
		},
		minStops: 4,
	},
];

test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false });
test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
	await installTauriShim(page, { platform: "macos" });
});

test.describe("keyboard focus stays visible and unclipped", () => {
	for (const {
		name,
		open,
		ready,
		composites,
		maxStops,
	} of COMPOSITE_SCREENS) {
		test(`on ${name}, crossing each composite in one Tab stop`, async ({
			page,
		}) => {
			await open(page);
			await ready(page)
				.first()
				.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
			await expectOneStopPerComposite({ page, composites, maxStops });
		});
	}

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
			const stops = await tabThroughOverlay(page, { key });
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
			await expectOneStopPerComposite({
				page,
				composites: [INBOX_FILTERS],
				maxStops: 5,
			});
		});

		test("in all filters", async ({ page }) => {
			await openGrid(page);
			await pressEnterOn({
				trigger: page.getByRole("button", { name: "All filters" }),
				ready: page.getByRole("button", { name: "Apply" }),
			});
			await waitForFocusIn(page.getByRole("dialog"));
			const stops = await tabThroughOverlay(page);
			expect(stops.length).toBeGreaterThanOrEqual(20);
			expect(focusProblems(stops)).toEqual([]);
		});
	});

	test("in the profile menu", async ({ page }) => {
		await page.goto("/profile/100001");
		const menuButton = page.getByRole("button", { name: "Profile menu" });
		await menuButton.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await pressEnterOn({
			trigger: menuButton,
			ready: page.getByRole("menu"),
		});
		await waitForFocusIn(page.getByRole("menu"));
		const stops = await arrowThrough(page, {
			key: "ArrowDown",
			stops: STOPS,
		});
		expect(stops.length).toBeGreaterThanOrEqual(3);
		expect(focusProblems(stops)).toEqual([]);
	});
});
