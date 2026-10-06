import { expect, type Locator, type Page, test } from "@playwright/test";

import { PSEUDO_MESSAGE } from "../src/lib/i18n/fixtures/pseudo-message";
import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";

const FAILING_ROUTE = "/interest";
const FAILING_LOAD = /\/interest\/\+page\.ts(?:\?|$)/;
const THROWING_LOAD =
	'export const load = () => { throw new Error("pseudo-locale check"); };';
const MISSING_ROUTE = "/no-such-page";

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

function readPseudoText(roots: Locator) {
	return roots.evaluateAll((elements) => {
		const outsidePseudo = (text: string) =>
			text.replace(/⟦[^⟦⟧]*⟧/g, " ").match(/\p{Script=Latin}+/gu) ?? [];
		const translatable = (element: Element) =>
			element.closest('[translate="no"]') === null &&
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
		return {
			messages: texts.join("").match(/⟦/g)?.length ?? 0,
			leaks: [...texts, document.title, ...attributes].flatMap(
				outsidePseudo,
			),
		};
	});
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

test.describe("converted navigation chrome under en-XA", () => {
	const routes = [
		{ path: "/right-now", roles: ["main", "navigation"], landmarks: 2 },
		{ path: "/settings/app", roles: ["navigation"], landmarks: 2 },
	] as const;

	test.beforeEach(async ({ page }) => {
		await installTauriShim(page);
	});

	for (const { path, roles, landmarks } of routes) {
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
			await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
			const { messages, leaks } = await readPseudoText(roots);
			expect(messages).toBeGreaterThan(0);
			expect(leaks).toEqual([]);
		});
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
