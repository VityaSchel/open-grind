import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	pathname,
} from "./support/app";
import {
	arrowThrough,
	focusProblems,
	measureFocusedElement,
} from "./support/focus";
import {
	TAP_ROW,
	TAPS,
	TAPS_SCROLLER,
	VIEWS,
	VIEWS_SCROLLER,
} from "./support/interest-pager";

const CREDITS = "/settings/app/credits";
const ARROW_WALK = 6;
const SETTLE_MS = 600;

type LinkList = {
	name: string;
	path: string;
	opens?: { row: string; path: string };
};

const rows = (page: Page) => page.locator("main").locator('[data-slot="item"]');

const SETTINGS_LISTS: LinkList[] = [
	{
		name: "Me",
		path: "/settings",
		opens: { row: "App Settings", path: "/settings/app" },
	},
	{
		name: "App Settings",
		path: "/settings/app",
		opens: { row: "Security", path: "/settings/app/security" },
	},
	{
		name: "Account Settings",
		path: "/settings/account",
		opens: { row: "Hidden", path: "/settings/account/hidden" },
	},
	{ name: "Security", path: "/settings/app/security" },
];

function isFocused(target: Locator): Promise<boolean> {
	return target.evaluate((node) => node === document.activeElement);
}

function focusedIndex(items: Locator): Promise<number> {
	return items.evaluateAll((nodes) =>
		nodes.findIndex((node) => node === document.activeElement),
	);
}

function focusInside(rows: Locator): Promise<boolean> {
	return rows.evaluateAll((nodes) =>
		nodes.some((node) => node.contains(document.activeElement)),
	);
}

async function expectOneTabStop({
	page,
	rows,
	stop,
}: {
	page: Page;
	rows: Locator;
	stop: Locator;
}): Promise<void> {
	await stop.focus();
	await page.keyboard.press("Tab");
	expect(await focusInside(rows)).toBe(false);
	await page.keyboard.press("Shift+Tab");
	expect(await isFocused(stop)).toBe(true);
	await page.keyboard.press("Shift+Tab");
	expect(await focusInside(rows)).toBe(false);
}

test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false });
test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

for (const { name, path, opens } of SETTINGS_LISTS) {
	test.describe(`the ${name} settings list`, () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(path);
			await rows(page)
				.first()
				.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		});

		test("is one Tab stop that remembers the last row", async ({
			page,
		}) => {
			await expectOneTabStop({
				page,
				rows: rows(page),
				stop: rows(page).nth(1),
			});
		});

		test("walks every row with the down and right arrows, visibly", async ({
			page,
		}) => {
			const count = await rows(page).count();
			for (const key of ["ArrowDown", "ArrowRight"]) {
				const stops = await arrowThrough(page, {
					start: rows(page).first(),
					key,
					stops: count + 2,
				});
				expect(stops).toHaveLength(count);
				expect(focusProblems(stops)).toEqual([]);
			}
		});

		test("jumps to the last and first rows with End and Home", async ({
			page,
		}) => {
			await rows(page).first().focus();
			await page.keyboard.press("End");
			expect(await isFocused(rows(page).last())).toBe(true);
			await page.keyboard.press("ArrowUp");
			await page.keyboard.press("Home");
			expect(await isFocused(rows(page).first())).toBe(true);
		});

		if (opens)
			test("refocuses the opened row after going back", async ({
				page,
			}) => {
				const row = rows(page).filter({ hasText: opens.row });
				await rows(page).first().focus();
				while (!(await isFocused(row)))
					await page.keyboard.press("ArrowDown");
				await page.keyboard.press("Enter");
				await expect.poll(() => pathname(page)).toBe(opens.path);
				await page.goBack();
				await expect.poll(() => pathname(page)).toBe(path);
				await expect.poll(() => isFocused(row)).toBe(true);
				await page.keyboard.press("Tab");
				await page.keyboard.press("Shift+Tab");
				expect(await isFocused(row)).toBe(true);
			});
	});
}

test.describe("the Taps list", () => {
	const tapRows = (page: Page) =>
		page.locator(TAPS_SCROLLER).locator('[data-slot="profile-item-link"]');

	test.beforeEach(async ({ page }) => {
		await page.goto(TAPS);
		await tapRows(page).nth(2).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	});

	test("is one Tab stop that remembers the last row", async ({ page }) => {
		await expectOneTabStop({
			page,
			rows: tapRows(page),
			stop: tapRows(page).nth(1),
		});
	});

	test("walks the rows with the down arrow, visibly", async ({ page }) => {
		const walked = Math.min(await tapRows(page).count(), ARROW_WALK);
		const stops = await arrowThrough(page, {
			start: tapRows(page).first(),
			key: "ArrowDown",
			stops: walked,
		});
		expect(stops).toHaveLength(walked);
		expect(focusProblems(stops)).toEqual([]);
	});

	test("keeps the left and right arrows from switching to Views", async ({
		page,
	}) => {
		const row = tapRows(page).nth(1);
		await row.focus();
		for (const key of ["ArrowLeft", "ArrowRight"]) {
			await page.keyboard.press(key);
			expect(await isFocused(row)).toBe(true);
		}
		await page.waitForTimeout(SETTLE_MS);
		expect(await pathname(page)).toBe(TAPS);
	});

	test("refocuses the opened row after going back", async ({ page }) => {
		const href = await tapRows(page).nth(1).getAttribute("href");
		await tapRows(page).first().focus();
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Enter");
		await expect.poll(() => pathname(page)).toBe(href);
		await page.goBack();
		await expect.poll(() => pathname(page)).toBe(TAPS);
		await expect.poll(() => isFocused(tapRows(page).nth(1))).toBe(true);
	});
});

test.describe("the Views grid", () => {
	const anonymousViewers = (page: Page) =>
		page
			.locator(VIEWS_SCROLLER)
			.getByRole("img", { name: /^(Secret admirer|Hidden viewer)/ });
	const cells = (page: Page) =>
		page
			.locator(VIEWS_SCROLLER)
			.locator(TAP_ROW)
			.or(anonymousViewers(page));

	test.beforeEach(async ({ page }) => {
		await page.goto(VIEWS);
		await anonymousViewers(page)
			.first()
			.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	});

	test("is one Tab stop that remembers the last cell", async ({ page }) => {
		await expectOneTabStop({
			page,
			rows: cells(page),
			stop: cells(page).nth(1),
		});
	});

	test("walks the cells with the right arrow, visibly", async ({ page }) => {
		const stops = await arrowThrough(page, {
			start: cells(page).first(),
			key: "ArrowRight",
			stops: ARROW_WALK,
		});
		expect(stops).toHaveLength(ARROW_WALK);
		expect(focusProblems(stops)).toEqual([]);
	});

	test("moves a whole row with the down arrow", async ({ page }) => {
		const columns = await cells(page).evaluateAll((nodes) => {
			const firstTop = nodes[0]!.getBoundingClientRect().top;
			return nodes.filter(
				(node) =>
					Math.abs(node.getBoundingClientRect().top - firstTop) < 1,
			).length;
		});
		expect(columns).toBeGreaterThan(1);
		await cells(page).first().focus();
		await page.keyboard.press("ArrowDown");
		expect(await focusedIndex(cells(page))).toBe(columns);
		await page.keyboard.press("ArrowUp");
		expect(await focusedIndex(cells(page))).toBe(0);
	});

	test("keeps the left arrow on the first cell from switching to Taps", async ({
		page,
	}) => {
		const first = cells(page).first();
		await first.focus();
		await page.keyboard.press("ArrowLeft");
		expect(await isFocused(first)).toBe(true);
		await page.waitForTimeout(SETTLE_MS);
		expect(await pathname(page)).toBe(VIEWS);
	});

	test("reaches an anonymous viewer by arrow and leaves it on Enter", async ({
		page,
	}) => {
		await cells(page).first().focus();
		await page.keyboard.press("Control+End");
		const viewer = anonymousViewers(page).last();
		expect(await isFocused(viewer)).toBe(true);
		const measured = await page.evaluate(measureFocusedElement);
		expect(focusProblems(measured ? [measured.stop] : [])).toEqual([]);
		await page.keyboard.press("Enter");
		await page.waitForTimeout(SETTLE_MS);
		expect(await pathname(page)).toBe(VIEWS);
		expect(await isFocused(viewer)).toBe(true);
	});

	test("refocuses the opened profile after going back", async ({ page }) => {
		const href = await cells(page).nth(1).getAttribute("href");
		await cells(page).first().focus();
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Enter");
		await expect.poll(() => pathname(page)).toBe(href);
		await page.goBack();
		await expect.poll(() => pathname(page)).toBe(VIEWS);
		await expect.poll(() => isFocused(cells(page).nth(1))).toBe(true);
	});
});

test.describe("the credits", () => {
	const firstSection = (page: Page) =>
		page.locator('[data-slot="credit-section"]').first();
	const items = (scope: Locator) => scope.locator("a[href], summary");

	test.beforeEach(async ({ page }) => {
		await page.goto(CREDITS);
		await page
			.getByRole("link", { name: "Suggest an edit" })
			.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	});

	test("makes each section one Tab stop", async ({ page }) => {
		await expectOneTabStop({
			page,
			rows: items(firstSection(page)),
			stop: items(firstSection(page)).nth(1),
		});
	});

	test("walks each row's link and then its license with the down arrow", async ({
		page,
	}) => {
		const section = firstSection(page);
		const stops = await arrowThrough(page, {
			start: items(section).first(),
			key: "ArrowDown",
			stops: ARROW_WALK,
		});
		expect(stops).toHaveLength(ARROW_WALK);
		expect(focusProblems(stops)).toEqual([]);
		const domOrder = await items(section).evaluateAll(
			(nodes, count) =>
				nodes.slice(0, count).map((node) => node.tagName.toLowerCase()),
			ARROW_WALK,
		);
		expect(stops.map(({ element }) => element.split(" ")[0])).toEqual(
			domOrder,
		);
	});

	test("jumps to the section ends with End and Home", async ({ page }) => {
		const section = firstSection(page);
		await items(section).first().focus();
		await page.keyboard.press("End");
		expect(await isFocused(items(section).last())).toBe(true);
		await page.keyboard.press("Home");
		expect(await isFocused(items(section).first())).toBe(true);
	});

	test("pages through a section with Page Down and Page Up, visibly", async ({
		page,
	}) => {
		const sectionItems = items(firstSection(page));
		const stops = await arrowThrough(page, {
			start: sectionItems.first(),
			key: "PageDown",
			stops: 2,
		});
		expect(stops).toHaveLength(2);
		expect(focusProblems(stops)).toEqual([]);
		const paged = await focusedIndex(sectionItems);
		expect(paged).toBeGreaterThan(1);
		await page.keyboard.press("PageUp");
		const back = await focusedIndex(sectionItems);
		expect(back).toBeGreaterThanOrEqual(0);
		expect(back).toBeLessThan(paged);
		const measured = await page.evaluate(measureFocusedElement);
		expect(focusProblems(measured ? [measured.stop] : [])).toEqual([]);
	});

	test("jumps past other rows to the next name starting with a typed letter", async ({
		page,
	}) => {
		const sectionItems = items(firstSection(page));
		const jump = await sectionItems.evaluateAll((nodes) => {
			const start = nodes.findIndex(
				(node) => node.localName === "summary",
			);
			const passed = new Set<string>();
			for (let index = start + 1; index < nodes.length; index++) {
				const node = nodes[index]!;
				const initial =
					node.textContent?.trim().charAt(0).toLowerCase() ?? "";
				if (node.localName !== "a" || !/[a-z]/.test(initial)) continue;
				if (index > start + 2 && !passed.has(initial))
					return { start, letter: initial, target: index };
				passed.add(initial);
			}
			return null;
		});
		expect(jump, "a letter that skips earlier rows").not.toBeNull();
		await sectionItems.nth(jump!.start).focus();
		await page.keyboard.press(jump!.letter);
		expect(await focusedIndex(sectionItems)).toBe(jump!.target);
	});
});
