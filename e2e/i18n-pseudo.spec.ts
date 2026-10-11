import { expect, type Locator, type Page, test } from "@playwright/test";

import { PSEUDO_MESSAGE } from "../src/lib/i18n/fixtures/pseudo-message";
import {
	DEMO_GEOHASH,
	EXPIRING_IMAGE,
	FIRST_ROUTE_COMPILE_MS,
	INCOMING_ROW,
	installTauriShim,
	pathname,
	runPaletteCommand,
} from "./support/app";
import { DRAWER } from "./support/drawer";

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

function readPseudoText(
	roots: Locator,
	{ brandTitle = "" }: { brandTitle?: string } = {},
) {
	return roots.evaluateAll((elements, brand) => {
		const withoutPseudo = (text: string): string => {
			const stripped = text.replace(/⟦[^⟦⟧]*⟧/g, " ");
			return stripped === text ? text : withoutPseudo(stripped);
		};
		const outsidePseudo = (text: string) =>
			withoutPseudo(text).match(/\p{Script=Latin}+/gu) ?? [];
		const translationOff = (element: Element) =>
			element.closest("[translate]")?.getAttribute("translate") === "no";
		const translatable = (element: Element) =>
			!translationOff(element) &&
			element.checkVisibility({ visibilityProperty: true });
		const texts = elements.map((root) => {
			const walker = document.createTreeWalker(
				root,
				NodeFilter.SHOW_TEXT,
			);
			let text = "";
			while (walker.nextNode()) {
				const { parentElement, nodeValue } = walker.currentNode;
				if (parentElement && translatable(parentElement)) {
					text += nodeValue;
				}
			}
			return text;
		});
		const attributes = elements
			.flatMap((root) => [root, ...root.querySelectorAll("*")])
			.filter(translatable)
			.flatMap((element) =>
				["aria-label", "title", "placeholder", "alt"].map(
					(name) => element.getAttribute(name) ?? "",
				),
			);
		const title = document.title === brand ? "" : document.title;
		return {
			messages: texts.join("").match(/⟦/g)?.length ?? 0,
			leaks: [...texts, title, ...attributes].flatMap(outsidePseudo),
		};
	}, brandTitle);
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

test("a conversation, a message menu and the attachment tabs render only pseudo-translated text", async ({
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

	await pane.locator('[aria-haspopup="menu"]').click();
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
