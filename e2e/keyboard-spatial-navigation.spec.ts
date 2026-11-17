import { expect, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	openGrid,
} from "./support/app";
import { tabCycle } from "./support/focus";

type Screen = {
	name: string;
	open: (page: Page) => Promise<unknown>;
	ready: string;
};

const STOPS = 80;

const SCREENS: Screen[] = [
	{
		name: "the browse grid",
		open: openGrid,
		ready: '[data-slot="grid-cells"] > a',
	},
	{
		name: "Right Now",
		open: async (page) => {
			await openGrid(page);
			await page.locator('nav a[href="/right-now"]').click();
		},
		ready: '[data-slot="right-now-post"]',
	},
	{
		name: "the inbox",
		open: (page) => page.goto("/chat"),
		ready: "a[href^='/chat/']",
	},
	{
		name: "a conversation",
		open: (page) => page.goto(DEMO_CONVERSATION),
		ready: '[data-slot="message"]',
	},
	{
		name: "Taps",
		open: (page) => page.goto("/interest/taps"),
		ready: '[data-slot="taps-scroller"] a',
	},
	{
		name: "Views",
		open: (page) => page.goto("/interest/views"),
		ready: '[data-slot="views-scroller"] a',
	},
	{
		name: "a profile",
		open: (page) => page.goto("/profile/100001"),
		ready: '[data-slot="profile-pane"]',
	},
	{
		name: "Me",
		open: (page) => page.goto("/settings"),
		ready: '[data-slot="me-scroller"] a',
	},
	{
		name: "the profile editor",
		open: (page) => page.goto("/settings/profile"),
		ready: '[data-slot="profile-form"]',
	},
	{
		name: "My Albums",
		open: (page) => page.goto("/settings/albums"),
		ready: '[data-slot="album-tile"]',
	},
	{
		name: "the blocked list",
		open: (page) => page.goto("/settings/account/blocked"),
		ready: '[role="switch"]',
	},
];

async function stopsThatAreNoControls(page: Page): Promise<string[]> {
	const strays: string[] = [];
	await tabCycle(page, {
		limit: STOPS,
		onStop: async () => {
			const stray = await page.evaluate(() => {
				const focused = document.activeElement;
				if (focused === null) return null;
				const control =
					focused.hasAttribute("tabindex") ||
					focused.matches(
						'a[href], button, input, select, textarea, summary, iframe, [contenteditable="true"], [contenteditable=""]',
					);
				if (control) return null;
				const slot = focused.getAttribute("data-slot");
				return `${focused.tagName.toLowerCase()} ${slot ?? focused.className}`;
			});
			if (stray !== null) strays.push(stray);
		},
	});
	return strays;
}

test.use({
	viewport: { width: 420, height: 800 },
	launchOptions: ({ launchOptions }, use) =>
		use({
			...launchOptions,
			args: [
				...(launchOptions.args ?? []),
				"--enable-spatial-navigation",
			],
		}),
});
test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
	await installTauriShim(page, { platform: "android" });
});

test.describe("with spatial navigation, as in the Android WebView", () => {
	for (const { name, open, ready } of SCREENS) {
		test(`Tab stops only on controls on ${name}`, async ({ page }) => {
			await open(page);
			await page
				.locator(ready)
				.first()
				.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

			expect(await stopsThatAreNoControls(page)).toEqual([]);
		});
	}
});
