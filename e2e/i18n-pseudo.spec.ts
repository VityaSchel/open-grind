import { expect, type Locator, type Page, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS } from "./support/app";

const FAILING_ROUTE = "/interest";
const FAILING_LOAD = /\/interest\/\+page\.ts(?:\?|$)/;
const THROWING_LOAD =
	'export const load = () => { throw new Error("pseudo-locale check"); };';

test.describe.configure({ timeout: 180_000 });

async function openErrorPage(
	page: Page,
	{ locale }: { locale: string },
): Promise<Locator> {
	await page.route(FAILING_LOAD, (route) =>
		route.fulfill({ contentType: "text/javascript", body: THROWING_LOAD }),
	);
	await page.goto(`${FAILING_ROUTE}?locale=${locale}`);
	const content = page.getByRole("main");
	await content
		.locator('[data-slot="empty-title"]')
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	return content;
}

function readPseudoText(content: Locator) {
	return content.evaluate((root) => {
		const outsidePseudo = (text: string) =>
			text.replace(/⟦[^⟦⟧]*⟧/g, " ").match(/\p{Script=Latin}+/gu) ?? [];
		const translatable = (element: Element) =>
			element.closest('[translate="no"]') === null &&
			element.checkVisibility({ visibilityProperty: true });
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let text = "";
		while (walker.nextNode()) {
			const { parentElement, nodeValue } = walker.currentNode;
			if (parentElement && translatable(parentElement)) {
				text += nodeValue;
			}
		}
		const attributes = [...root.querySelectorAll("*")]
			.filter(translatable)
			.flatMap((element) =>
				["aria-label", "title", "placeholder", "alt"].map(
					(name) => element.getAttribute(name) ?? "",
				),
			);
		return {
			messages: text.match(/⟦/g)?.length ?? 0,
			leaks: [text, document.title, ...attributes].flatMap(outsidePseudo),
		};
	});
}

test("the error page renders only pseudo-translated text under en-XA", async ({
	page,
}) => {
	const content = await openErrorPage(page, { locale: "en-XA" });
	await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
	await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
	await expect(page).toHaveTitle(/^⟦.+⟧$/);
	const { messages, leaks } = await readPseudoText(content);
	expect(messages).toBeGreaterThan(0);
	expect(leaks).toEqual([]);
});

test("ar-XB lays the error page out right to left", async ({ page }) => {
	await openErrorPage(page, { locale: "ar-XB" });
	await expect(page.locator("html")).toHaveAttribute("lang", "ar-XB");
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	await expect(page).toHaveTitle(/^\u202E.+\u202C$/);
});

test("an unknown locale parameter leaves the app in English", async ({
	page,
}) => {
	await openErrorPage(page, { locale: "xx-YY" });
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expect(page).not.toHaveTitle(/[⟦\u202E]/);
});
