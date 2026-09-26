import type { Locator, Page } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	ensureGridLocation,
	FIRST_ROUTE_COMPILE_MS,
} from "./app";

type Edge = "top" | "bottom";
type Backdrop = "content" | "nothing";

export type Surface = {
	name: string;
	path: string;
	bars: Partial<Record<Edge, Backdrop>>;
	ready: (page: Page) => Promise<void>;
};

const BARS_OVER_CONTENT = { top: "content", bottom: "content" } as const;
const CREDIT_ROWS_CHECKED = 30;

const shows = (locate: (page: Page) => Locator) => (page: Page) =>
	locate(page).first().waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

const mainNavigation = (page: Page) =>
	page.getByRole("navigation", { name: "Main" });
const subpage = (page: Page) => page.locator('[data-slot="subpage-scroller"]');
const suggestAnEdit = (page: Page) =>
	page.getByRole("link", { name: "Suggest an edit" });

function keepFirstCreditRows(page: Page): Promise<void> {
	return page.evaluate((kept) => {
		document
			.querySelectorAll('[data-slot="credit-row"]')
			.forEach((row, index) => {
				if (index >= kept) row.remove();
			});
	}, CREDIT_ROWS_CHECKED);
}

export const SURFACES: Surface[] = [
	{
		name: "Browse",
		path: "/",
		bars: BARS_OVER_CONTENT,
		ready: async (page) => {
			await shows(mainNavigation)(page);
			await ensureGridLocation(page);
		},
	},
	{
		name: "Right Now",
		path: "/right-now",
		bars: { bottom: "nothing" },
		ready: shows(mainNavigation),
	},
	{
		name: "Interest views",
		path: "/interest/views",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) =>
			page.locator('[data-slot="interest-pane-views"]').getByRole("link"),
		),
	},
	{
		name: "Interest taps",
		path: "/interest/taps",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) =>
			page.locator('[data-slot="interest-pane-taps"]').getByRole("link"),
		),
	},
	{
		name: "Inbox",
		path: "/chat",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) =>
			page
				.locator('[data-slot="conversations-scroller"]')
				.getByRole("link"),
		),
	},
	{
		name: "Conversation",
		path: DEMO_CONVERSATION,
		bars: BARS_OVER_CONTENT,
		ready: shows((page) => page.getByRole("article")),
	},
	{
		name: "Profile",
		path: "/profile/100001",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) =>
			page.getByRole("button", { name: "Profile menu" }),
		),
	},
	{
		name: "Me",
		path: "/settings",
		bars: { bottom: "content" },
		ready: shows((page) =>
			page.getByRole("link", { name: "App settings" }),
		),
	},
	{
		name: "Account",
		path: "/settings/account",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) => subpage(page).getByRole("link")),
	},
	{
		name: "Blocked profiles",
		path: "/settings/account/blocked",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) => subpage(page).getByRole("link")),
	},
	{
		name: "Hidden profiles",
		path: "/settings/account/hidden",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) =>
			subpage(page)
				.getByRole("link")
				.or(page.getByText("No Hidden Users")),
		),
	},
	{
		name: "Privacy",
		path: "/settings/account/privacy",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) => subpage(page).getByRole("switch")),
	},
	{
		name: "My albums",
		path: "/settings/albums",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) => page.locator('[data-slot="album-tile"]')),
	},
	{
		name: "New album",
		path: "/settings/albums/new",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) => subpage(page).getByRole("textbox")),
	},
	{
		name: "Album",
		path: "/settings/albums/903",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) => subpage(page).getByRole("img")),
	},
	{
		name: "App settings",
		path: "/settings/app",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) => page.getByRole("slider")),
	},
	{
		name: "Credits",
		path: "/settings/app/credits",
		bars: BARS_OVER_CONTENT,
		ready: async (page) => {
			await shows(suggestAnEdit)(page);
			await keepFirstCreditRows(page);
		},
	},
	{
		name: "Notifications",
		path: "/settings/app/notifications",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) =>
			subpage(page)
				.getByRole("switch")
				.or(subpage(page).getByRole("paragraph")),
		),
	},
	{
		name: "Edit profile",
		path: "/settings/profile",
		bars: BARS_OVER_CONTENT,
		ready: shows((page) => subpage(page).getByRole("textbox")),
	},
	{
		name: "Not found",
		path: "/definitely-not-a-route",
		bars: {},
		ready: shows((page) =>
			page.getByRole("link", { name: "Report an issue" }),
		),
	},
];
