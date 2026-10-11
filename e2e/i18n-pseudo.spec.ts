import { expect, type Locator, type Page, test } from "@playwright/test";

import { PSEUDO_MESSAGE } from "../src/lib/i18n/fixtures/pseudo-message";
import {
	enterAlbum,
	openAlbums,
	serveAlbumMedia,
	SHARED_ALBUM,
} from "./support/albums";
import {
	DEMO_CONVERSATION,
	DEMO_GEOHASH,
	EXPIRING_IMAGE,
	FIRST_ROUTE_COMPILE_MS,
	INCOMING_ROW,
	installTauriShim,
	pathname,
	runPaletteCommand,
} from "./support/app";
import { DRAWER, MEDIA_TILE } from "./support/drawer";
import { readPseudoText } from "./support/pseudo";
import { ACTIVE_SURFACE, CLIP, LIGHTBOX } from "./support/video";

const FAILING_ROUTE = "/interest";
const FAILING_LOAD = /\/interest\/\+page\.ts(?:\?|$)/;
const THROWING_LOAD =
	'export const load = () => { throw new Error("pseudo-locale check"); };';
const MISSING_ROUTE = "/no-such-page";
const AUTH_LAYOUT_LOAD = /\/routes\/auth\/\+layout\.ts(?:\?|$)/;
const SIGNED_OUT_LOAD = "export const load = () => {};";
const BRAND_TITLE = "Open Grind";
const DEMO_PROFILE = "/profile/100001";
const PROFILE_NAVIGATIONS = 4;
const REPORT_MENU_ITEM = 1;
const VIEWED_PROFILE_CARD = '.photo-grid > a[href^="/profile/"]';
const VIEWED_PREVIEW_CARD = '.photo-grid > div:not([data-slot="skeleton"])';
const RECEIVED_TAP = '[data-slot="taps-scroller"] a[href^="/profile/"]';
const PHOTO_CONVERSATION = "/chat/100002:123456000";
const DRAWER_PILL = "button:not([aria-label], [aria-pressed])";
const MENU_TRIGGER = '[aria-haspopup="menu"]';
const ADD_TILE = '[data-slot="add-tile"]';
const CANCEL_BUTTON = '[data-slot="alert-dialog-cancel"]';
const PLAYED_OUT_CONVERSATION = "/chat/100006:123456000";
const ALBUM_PREVIEW = '[data-slot="album-preview"]';
const COUNTER = ".pswp__counter";
const ACTIVE_SLIDE = '.pswp__item[aria-hidden="false"]';
const NO_PLAYS_LEFT = '[data-slot="no-plays-left"]';
const VIDEO_CONTROLS = "[data-pswp-interactive]";
const KBD = '[data-slot="kbd"]';
const SUGGESTIONS_GROUP =
	'[data-slot="command-group"][data-value="suggestions"]';
const COMMAND_EMPTY = '[data-slot="command-empty"]';

test.describe.configure({ timeout: 180_000 });

async function waitForErrorContent(page: Page): Promise<Locator> {
	const content = page.getByRole("main");
	await content
		.locator('[data-slot="empty-title"]')
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	return content;
}

async function openErrorPage(
	page: Page,
	{ locale }: { locale: string },
): Promise<Locator> {
	await page.route(FAILING_LOAD, (route) =>
		route.fulfill({ contentType: "text/javascript", body: THROWING_LOAD }),
	);
	await page.goto(`${FAILING_ROUTE}?locale=${locale}`);
	return waitForErrorContent(page);
}

async function openNotFoundPage(
	page: Page,
	{ locale }: { locale: string },
): Promise<Locator> {
	await page.goto(`${MISSING_ROUTE}?locale=${locale}`);
	return waitForErrorContent(page);
}

test.describe("error pages under en-XA", () => {
	const errorPages = [
		{ name: "unexpected-error", open: openErrorPage },
		{ name: "not-found", open: openNotFoundPage },
	] as const;

	for (const { name, open } of errorPages) {
		test(`the ${name} page renders only pseudo-translated text`, async ({
			page,
		}) => {
			const content = await open(page, { locale: "en-XA" });
			await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
			await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
			await expect(page).toHaveTitle(PSEUDO_MESSAGE);
			const { messages, leaks } = await readPseudoText(content);
			expect(messages).toBeGreaterThan(0);
			expect(leaks).toEqual([]);
		});
	}
});

test("ar-XB lays the not-found page out right to left", async ({ page }) => {
	await openNotFoundPage(page, { locale: "ar-XB" });
	await expect(page.locator("html")).toHaveAttribute("lang", "ar-XB");
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	await expect(page).toHaveTitle(/^\u202E.+\u202C$/);
});

test("an unknown locale parameter leaves the app in English", async ({
	page,
}) => {
	await openNotFoundPage(page, { locale: "xx-YY" });
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expect(page).not.toHaveTitle(/[⟦\u202E]/);
});

interface ChromeRoute {
	path: string;
	roles: readonly ("main" | "navigation")[];
	landmarks: number;
	shows?: readonly string[];
	brandTitle?: string;
}

test.describe("converted navigation chrome under en-XA", () => {
	const routes: readonly ChromeRoute[] = [
		{
			path: "/",
			roles: ["main", "navigation"],
			landmarks: 2,
			brandTitle: BRAND_TITLE,
		},
		{ path: "/right-now", roles: ["main", "navigation"], landmarks: 2 },
		{ path: "/settings/app", roles: ["navigation"], landmarks: 2 },
		{
			path: "/interest/views",
			roles: ["main", "navigation"],
			landmarks: 3,
			shows: [VIEWED_PROFILE_CARD, VIEWED_PREVIEW_CARD],
		},
		{
			path: "/interest/taps",
			roles: ["main", "navigation"],
			landmarks: 3,
			shows: [RECEIVED_TAP],
		},
		{
			path: DEMO_PROFILE,
			roles: ["main", "navigation"],
			landmarks: PROFILE_NAVIGATIONS + 1,
		},
	];

	test.beforeEach(async ({ page }) => {
		await installTauriShim(page);
	});

	for (const { path, roles, landmarks, shows = [], brandTitle } of routes) {
		test(`${path} renders its ${roles.join(" and ")} landmarks only pseudo-translated`, async ({
			page,
		}) => {
			await page.goto(`${path}?locale=en-XA`);
			const roots = roles
				.map((role) => page.getByRole(role))
				.reduce((all, landmark) => all.or(landmark));
			await expect(roots).toHaveCount(landmarks, {
				timeout: FIRST_ROUTE_COMPILE_MS,
			});
			for (const selector of shows) {
				await page
					.getByRole("main")
					.locator(selector)
					.first()
					.waitFor({ timeout: 60_000 });
			}
			await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
			const { messages, leaks } = await readPseudoText(roots, {
				brandTitle,
			});
			expect(messages).toBeGreaterThan(0);
			expect(leaks).toEqual([]);
		});
	}
});

test("the browse grid top bar and its quick-filter drawers render only pseudo-translated text", async ({
	page,
}) => {
	await installTauriShim(page, { platform: "android" });
	await page.goto("/?locale=en-XA");
	await page
		.locator("nav a")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await runPaletteCommand(page, `@${DEMO_GEOHASH}`);
	const topBar = page.locator("[data-fixed-header]");
	const drawerPills = topBar
		.locator(DRAWER_PILL)
		.filter({ hasText: PSEUDO_MESSAGE });
	await expect(drawerPills).toHaveCount(2, { timeout: 60_000 });
	await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
	const scans = [await readPseudoText(topBar, { brandTitle: BRAND_TITLE })];
	for (const pill of await drawerPills.all()) {
		await pill.click();
		const drawer = page.getByRole("dialog");
		await drawer.waitFor();
		scans.push(await readPseudoText(drawer, { brandTitle: BRAND_TITLE }));
		await page.keyboard.press("Escape");
		await expect(drawer).toBeHidden();
	}
	for (const { messages, leaks } of scans) {
		expect(messages).toBeGreaterThan(0);
		expect(leaks).toEqual([]);
	}
});

interface PaletteView {
	query: string;
	shows?: string;
}

const paletteOption = (value: string) =>
	`[role="option"][data-value="${value}"]`;

test("the command center trigger, palette and commands render only pseudo-translated text", async ({
	page,
}) => {
	const views: readonly PaletteView[] = [
		{ query: "", shows: SUGGESTIONS_GROUP },
		{ query: "?online=true&ageMin=25" },
		{ query: "?nope=1" },
		{ query: "?genders=-1,1&tags=bear,otter" },
		{ query: "#" },
		{ query: "/", shows: paletteOption("/grid") },
		{ query: "@", shows: paletteOption("@copy") },
		{ query: "grid", shows: COMMAND_EMPTY },
	];
	await installTauriShim(page);
	await page.goto("/?locale=en-XA");
	await page
		.locator("nav a")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await runPaletteCommand(page, `@${DEMO_GEOHASH}`);
	const palette = page.getByRole("dialog");
	await expect(palette).toBeHidden();
	const trigger = page
		.locator('[data-fixed-header] [data-slot="button"]')
		.filter({ has: page.locator(KBD) });
	await trigger.waitFor({ timeout: 60_000 });
	await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
	const triggerScan = await readPseudoText(trigger, {
		brandTitle: BRAND_TITLE,
	});

	await page.keyboard.press("ControlOrMeta+k");
	const input = palette.getByRole("combobox");
	await input.waitFor();
	const scans = [];
	for (const { query, shows = paletteOption(query) } of views) {
		await input.fill(query);
		await palette.locator(shows).waitFor();
		scans.push(await readPseudoText(palette, { brandTitle: BRAND_TITLE }));
	}

	expect(triggerScan.labels).toBeGreaterThan(0);
	expect(triggerScan.leaks).toEqual([]);
	for (const { messages, leaks } of scans) {
		expect(messages).toBeGreaterThan(0);
		expect(leaks).toEqual([]);
	}
});

test("the inbox and its quick-filter drawers render only pseudo-translated text", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/chat?locale=en-XA");
	const inbox = page.getByRole("main");
	await inbox
		.locator(`a[href="${PHOTO_CONVERSATION}"]`)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
	const landmarks = inbox.or(page.getByRole("navigation"));
	await expect(landmarks).toHaveCount(2);
	const scans = [await readPseudoText(landmarks)];
	const drawerPills = inbox
		.locator(`[data-fixed-header] ${DRAWER_PILL}`)
		.filter({ hasText: PSEUDO_MESSAGE });
	await expect(drawerPills).toHaveCount(2);
	for (const pill of await drawerPills.all()) {
		await pill.click();
		const drawer = page.getByRole("dialog");
		await drawer.waitFor();
		scans.push(await readPseudoText(drawer));
		await page.keyboard.press("Escape");
		await expect(drawer).toBeHidden();
	}
	for (const { messages, leaks } of scans) {
		expect(messages).toBeGreaterThan(0);
		expect(leaks).toEqual([]);
	}
});

test("a conversation, a message menu, the attachment tabs and a media tile's menu render only pseudo-translated text", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto(`${PHOTO_CONVERSATION}?locale=en-XA`);
	const conversation = page.getByRole("main");
	await conversation
		.locator(EXPIRING_IMAGE)
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
	const landmarks = conversation.or(page.getByRole("navigation"));
	await expect(landmarks).toHaveCount(2);
	const scans = [await readPseudoText(landmarks)];

	await conversation.locator(INCOMING_ROW).last().click({ button: "right" });
	const menu = page.getByRole("dialog");
	await menu.waitFor();
	scans.push(await readPseudoText(menu));
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();

	await conversation
		.locator('[data-slot="composer-attachments-trigger"] button')
		.click();
	const attachments = page.locator(DRAWER);
	const tabList = attachments.getByRole("tablist");
	await tabList.waitFor();
	scans.push(
		await readPseudoText(
			tabList.or(attachments.locator('[data-slot="drawer-title"]')),
		),
	);

	const mediaTile = attachments.locator(MEDIA_TILE).first();
	await mediaTile.waitFor();
	const tiles = await readPseudoText(attachments.getByRole("tabpanel"));
	await mediaTile.click({ button: "right" });
	const tileMenu = page.getByRole("menu");
	await tileMenu.waitFor();
	scans.push(await readPseudoText(tileMenu));
	await tileMenu.getByRole("menuitem").click();
	const confirm = page.getByRole("alertdialog");
	await confirm.waitFor();
	scans.push(await readPseudoText(confirm));
	await page.keyboard.press("Escape");
	await expect(confirm).toBeHidden();

	expect(tiles.labels).toBeGreaterThan(0);
	expect(tiles.leaks).toEqual([]);
	for (const { messages, leaks } of scans) {
		expect(messages).toBeGreaterThan(0);
		expect(leaks).toEqual([]);
	}
});

test("the profile note editor, actions menu and report sheet render only pseudo-translated text", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto(`${DEMO_PROFILE}?locale=en-XA`);
	await expect(page.getByRole("navigation")).toHaveCount(
		PROFILE_NAVIGATIONS,
		{ timeout: FIRST_ROUTE_COMPILE_MS },
	);
	await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
	const pane = page.getByRole("main");
	const dialog = page.getByRole("dialog");

	await pane.locator(':scope > [data-slot="button"]').click();
	await dialog.waitFor();
	const scans = [await readPseudoText(dialog)];
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();

	await pane.locator(MENU_TRIGGER).click();
	const menu = page.getByRole("menu");
	await menu.waitFor();
	scans.push(await readPseudoText(menu));
	await menu.getByRole("menuitem").nth(REPORT_MENU_ITEM).click();
	await dialog
		.locator('[data-slot="report-reasons"] [data-value="IMPERSONATION"]')
		.click();
	await dialog.locator('[data-slot="report-locations"]').waitFor();
	scans.push(await readPseudoText(dialog));
	await dialog
		.locator('[data-slot="drawer-footer"] [data-slot="button"]')
		.click();
	await dialog.locator('[data-slot="report-submitted"]').waitFor();
	scans.push(await readPseudoText(dialog));

	for (const { messages, leaks } of scans) {
		expect(messages).toBeGreaterThan(0);
		expect(leaks).toEqual([]);
	}
});

test("my albums, an album, its previous uploads and its menu render only pseudo-translated text", async ({
	page,
}) => {
	await openAlbums(page, { locale: "en-XA" });
	await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
	const content = page.getByRole("main");
	const landmarks = content.or(page.getByRole("navigation"));
	await expect(landmarks).toHaveCount(3);
	const scans = [await readPseudoText(landmarks)];

	await enterAlbum(page, SHARED_ALBUM);
	scans.push(await readPseudoText(content));

	await content.locator(ADD_TILE).click();
	const uploads = page.getByRole("dialog");
	await uploads.locator(MEDIA_TILE).first().waitFor();
	scans.push(await readPseudoText(uploads));
	await page.keyboard.press("Escape");
	await expect(uploads).toBeHidden();

	await page.getByRole("navigation").locator(MENU_TRIGGER).click();
	const menu = page.getByRole("menu");
	await menu.waitFor();
	scans.push(await readPseudoText(menu));
	await menu.getByRole("menuitem").click();
	const confirm = page.getByRole("alertdialog");
	await confirm.waitFor();
	scans.push(await readPseudoText(confirm));
	await confirm.locator(CANCEL_BUTTON).click();
	await expect(confirm).toBeHidden();

	for (const { messages, leaks } of scans) {
		expect(messages).toBeGreaterThan(0);
		expect(leaks).toEqual([]);
	}
});

async function openAlbumLightbox(
	page: Page,
	{ conversation }: { conversation: string },
): Promise<Locator> {
	await page.goto(`${conversation}?locale=en-XA`);
	await page
		.locator(ALBUM_PREVIEW)
		.first()
		.click({ timeout: FIRST_ROUTE_COMPILE_MS });
	const lightbox = page.locator(LIGHTBOX);
	await lightbox.waitFor({ timeout: 30_000 });
	await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
	await expect(lightbox.locator(COUNTER)).not.toBeEmpty();
	return lightbox;
}

async function showLastSlide(page: Page): Promise<void> {
	const counter = page.locator(COUNTER);
	await expect(async () => {
		if ((await counter.textContent()) === "1 / 3") {
			await page.keyboard.press("ArrowLeft");
		}
		await expect(counter).toHaveText("3 / 3", { timeout: 1_000 });
	}).toPass({ timeout: 15_000 });
}

test("an album lightbox and its played-out video slide render only pseudo-translated text", async ({
	page,
}) => {
	await serveAlbumMedia(page);
	const lightbox = await openAlbumLightbox(page, {
		conversation: PLAYED_OUT_CONVERSATION,
	});
	const controls = await readPseudoText(lightbox);

	await showLastSlide(page);
	const slide = page.locator(ACTIVE_SLIDE);
	await slide.locator(NO_PLAYS_LEFT).waitFor();
	const playedOut = await readPseudoText(slide);

	expect(controls.labels).toBeGreaterThan(0);
	expect(playedOut.messages).toBeGreaterThan(0);
	expect([...controls.leaks, ...playedOut.leaks]).toEqual([]);
});

test("album video controls render only pseudo-translated text", async ({
	page,
}) => {
	await serveAlbumMedia(page);
	await page.route(CLIP, () => {});
	await openAlbumLightbox(page, { conversation: DEMO_CONVERSATION });
	await showLastSlide(page);
	const surface = page.locator(ACTIVE_SURFACE);
	await surface.hover();
	await surface.locator(VIDEO_CONTROLS).waitFor();

	const { labels, leaks } = await readPseudoText(surface);
	expect(labels).toBeGreaterThan(0);
	expect(leaks).toEqual([]);
});

test("ar-XB lays the navigation bar out right to left", async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/right-now?locale=ar-XB");
	const navBar = page
		.getByRole("navigation")
		.filter({ has: page.locator('a[href="/right-now"]') });
	const browse = navBar.locator('a[href="/"]');
	const inbox = navBar.locator('a[href="/chat"]');
	await browse.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	await expect(browse).toHaveText(/^\s*\u202E.+\u202C\s*$/);
	const [browseBox, inboxBox] = await Promise.all([
		browse.boundingBox(),
		inbox.boundingBox(),
	]);
	expect(browseBox?.x).toBeGreaterThan(inboxBox?.x ?? Infinity);
});

test.describe("auth pages under en-XA", () => {
	const authPages = [
		{
			name: "sign-in page",
			path: "/auth/sign-in",
			platform: "web",
			shows: '[data-slot="input"][type="email"]',
		},
		{
			name: "Google token paste view",
			path: "/auth/sign-in/google",
			platform: "web",
			shows: '[data-slot="textarea"]',
		},
		{
			name: "Google add-on install view",
			path: "/auth/sign-in/google",
			platform: "android",
			shows: 'p [data-slot="button"]',
		},
		{
			name: "password-reset page",
			path: "/auth/password-reset",
			platform: "web",
			shows: '[data-slot="alert"]',
		},
		{
			name: "sign-up page",
			path: "/auth/sign-up",
			platform: "web",
			shows: '[data-slot="alert"]',
		},
	] as const;

	for (const { name, path, platform, shows } of authPages) {
		test(`the ${name} renders only pseudo-translated text`, async ({
			page,
		}) => {
			if (platform !== "web") await installTauriShim(page, { platform });
			await page.route(AUTH_LAYOUT_LOAD, (route) =>
				route.fulfill({
					contentType: "text/javascript",
					body: SIGNED_OUT_LOAD,
				}),
			);
			await page.goto(`${path}?locale=en-XA`);
			const content = page.getByRole("main");
			await content
				.locator(shows)
				.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
			expect(await pathname(page)).toBe(path);
			await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
			await expect(page).toHaveTitle(PSEUDO_MESSAGE);
			const { messages, leaks } = await readPseudoText(content);
			expect(messages).toBeGreaterThan(0);
			expect(leaks).toEqual([]);
		});
	}
});
