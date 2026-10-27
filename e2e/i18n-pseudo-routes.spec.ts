import { expect, type Page, test } from "@playwright/test";
import { readdirSync } from "node:fs";
import { sep } from "node:path";

import { DEV_SERVER_URL } from "../playwright.config";
import { PSEUDO_MESSAGE } from "../src/lib/i18n/fixtures/pseudo-message";
import { SHARED_ALBUM_ID } from "./support/albums";
import {
	DEMO_GEOHASH,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	pathname,
	runPaletteCommand,
} from "./support/app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";
import { BRAND_TITLE, readPseudoText } from "./support/pseudo";

test.use({ baseURL: DEV_SERVER_URL });

type Platform = "android" | "desktop" | "web";

interface ModuleOverride {
	module: RegExp;
	body: string;
}

interface RouteCase {
	route: string;
	path: string;
	shows: string;
	state?: string;
	platforms?: readonly Platform[];
	titled?: boolean;
	layout?: ModuleOverride;
	prepare?: (page: Page) => Promise<void>;
}

const SIGNED_IN: readonly Platform[] = ["android", "desktop"];
const SIGNED_OUT: readonly Platform[] = ["web", "android", "desktop"];
const PAGE_FILE = /^\+page(?:@[^.]*)?\.svelte$/;
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const SETTINGS = "/settings";
const ACCOUNT = `${SETTINGS}/account`;
const APP = `${SETTINGS}/app`;
const ALBUMS = `${SETTINGS}/albums`;
const SWITCH = '[role="switch"]';
const ALERT = '[data-slot="alert"]';
const EMPTY_TITLE = '[data-slot="empty-title"]';
const NO_LOAD = "export const load = () => {};";
const SIGNED_OUT_LAYOUT: ModuleOverride = {
	module: /\/routes\/auth\/\+layout\.ts(?:\?|$)/,
	body: NO_LOAD,
};
const ROOT_LAYOUT_WITHOUT_REDIRECTS: ModuleOverride = {
	module: /\/src\/routes\/\+layout\.ts(?:\?|$)/,
	body: NO_LOAD,
};

async function chooseDemoLocation(page: Page): Promise<void> {
	await page
		.locator(EMPTY_TITLE)
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await runPaletteCommand(page, `@${DEMO_GEOHASH}`);
}

const routes: readonly RouteCase[] = [
	{ route: "/(protected)/(navbar)/(root)", path: "/", shows: EMPTY_TITLE },
	{
		route: "/(protected)/(navbar)/(root)",
		state: "with a location",
		path: "/",
		shows: '[data-slot="grid-cells"] a[href^="/profile/"]',
		prepare: chooseDemoLocation,
	},
	{
		route: "/(protected)/(navbar)/interest/taps",
		path: "/interest/taps",
		shows: '[data-slot="taps-scroller"] a[href^="/profile/"]',
	},
	{
		route: "/(protected)/(navbar)/interest/views",
		path: "/interest/views",
		shows: '.photo-grid:has(> a[href^="/profile/"]):has(> div:not([data-slot="skeleton"]))',
	},
	{
		route: "/(protected)/(navbar)/profile/[profileId]",
		path: "/profile/100001",
		shows: '[data-slot="profile-pane"]',
	},
	{
		route: "/(protected)/(navbar)/right-now",
		path: "/right-now",
		shows: ALERT,
	},
	{
		route: "/(protected)/(navbar)/settings/(me)",
		path: SETTINGS,
		shows: 'a[href^="/profile/"] [translate="no"]',
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/account",
		path: ACCOUNT,
		shows: `a[href="${ACCOUNT}/privacy"]`,
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/account/blocked",
		path: `${ACCOUNT}/blocked`,
		shows: SWITCH,
		titled: true,
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/account/hidden",
		path: `${ACCOUNT}/hidden`,
		shows: `${EMPTY_TITLE}, ${SWITCH}`,
		titled: true,
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/account/privacy",
		path: `${ACCOUNT}/privacy`,
		shows: SWITCH,
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/albums",
		path: ALBUMS,
		shows: '[data-slot="album-tile"]',
		titled: true,
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/albums/[albumId]",
		path: `${ALBUMS}/${SHARED_ALBUM_ID}`,
		shows: '[data-slot="media-slot"]',
		titled: true,
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/albums/new",
		path: `${ALBUMS}/new`,
		shows: EMPTY_TITLE,
		titled: true,
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/app",
		path: APP,
		shows: `a[href="${APP}/credits"]`,
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/app/credits",
		path: `${APP}/credits`,
		shows: 'a[href$="/issues/new"]',
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/app/display",
		path: `${APP}/display`,
		shows: '[role="slider"]',
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/app/language",
		path: `${APP}/language`,
		shows: '[data-slot="language-option"]',
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/app/notifications",
		path: `${APP}/notifications`,
		shows: "main p",
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/app/privacy",
		path: `${APP}/privacy`,
		shows: SWITCH,
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/app/security",
		path: `${APP}/security`,
		shows: 'main a[href="#/"]',
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/app/updates",
		path: `${APP}/updates`,
		shows: `nav a[href="${APP}"]`,
	},
	{
		route: "/(protected)/(navbar)/settings/(subpage)/profile",
		path: `${SETTINGS}/profile`,
		shows: '[data-slot="profile-form"]',
	},
	{ route: "/(protected)/chat", path: "/chat", shows: 'a[href^="/chat/"]' },
	{
		route: "/(protected)/chat/[conversationId]",
		path: "/chat/100002:123456000",
		shows: '[data-slot="expiring-image-message"]',
	},
	{
		route: "/auth/password-reset",
		path: "/auth/password-reset",
		shows: ALERT,
		platforms: SIGNED_OUT,
		titled: true,
		layout: SIGNED_OUT_LAYOUT,
	},
	{
		route: "/auth/sign-in",
		path: "/auth/sign-in",
		shows: '[data-slot="input"][type="email"]',
		platforms: SIGNED_OUT,
		titled: true,
		layout: SIGNED_OUT_LAYOUT,
	},
	{
		route: "/auth/sign-in/google",
		state: "with the token field",
		path: "/auth/sign-in/google",
		shows: '[data-slot="textarea"]',
		platforms: ["web", "desktop"],
		titled: true,
		layout: SIGNED_OUT_LAYOUT,
	},
	{
		route: "/auth/sign-in/google",
		state: "with the add-on",
		path: "/auth/sign-in/google",
		shows: '[data-slot="card-footer"] [data-slot="button"][type="button"]',
		platforms: ["android"],
		titled: true,
		layout: SIGNED_OUT_LAYOUT,
	},
	{
		route: "/auth/sign-up",
		path: "/auth/sign-up",
		shows: ALERT,
		platforms: SIGNED_OUT,
		titled: true,
		layout: SIGNED_OUT_LAYOUT,
	},
	{
		route: "/onboarding",
		path: "/onboarding",
		shows: 'main [data-slot="button"]',
		titled: true,
		layout: ROOT_LAYOUT_WITHOUT_REDIRECTS,
	},
];

test.describe.configure({ timeout: 180_000 });

function pageRoutes(): string[] {
	const root = new URL("../src/routes", import.meta.url);
	return readdirSync(root, { encoding: "utf8", recursive: true })
		.map((file) => file.split(sep))
		.filter((parts) => PAGE_FILE.test(parts.at(-1) ?? ""))
		.map((parts) => `/${parts.slice(0, -1).join("/")}`);
}

async function open(
	page: Page,
	{
		path,
		platform,
		layout,
	}: { path: string; platform: Platform; layout?: ModuleOverride },
): Promise<void> {
	if (platform !== "web") {
		await installTauriShim(page, {
			platform: platform === "android" ? "android" : "macos",
		});
	}
	if (platform === "desktop") await page.setViewportSize(DESKTOP_VIEWPORT);
	await serveImages(page, AVATAR_HOST);
	await serveImages(page, CHAT_MEDIA_HOST);
	if (layout !== undefined) {
		await page.route(layout.module, (route) =>
			route.fulfill({
				contentType: "text/javascript",
				body: layout.body,
			}),
		);
	}
	await page.goto(`${path}?locale=en-XA`);
}

test("the route table lists every page", () => {
	const listed = new Set(routes.map(({ route }) => route));
	expect([...listed].toSorted()).toEqual(pageRoutes().toSorted());
});

for (const {
	route,
	state,
	path,
	shows,
	platforms = SIGNED_IN,
	titled = false,
	layout,
	prepare,
} of routes) {
	const name = state === undefined ? route : `${route} ${state}`;
	for (const platform of platforms) {
		test(`${name} on ${platform} renders only pseudo-translated text`, async ({
			page,
		}) => {
			await open(page, { path, platform, layout });
			await prepare?.(page);
			await page
				.locator(shows)
				.first()
				.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
			expect(await pathname(page)).toBe(path);
			await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
			if (titled) await expect(page).toHaveTitle(PSEUDO_MESSAGE);
			const { messages, leaks } = await readPseudoText(
				page.locator("body"),
				{ brandTitle: BRAND_TITLE },
			);
			expect(messages).toBeGreaterThan(0);
			expect(leaks).toEqual([]);
		});
	}
}
