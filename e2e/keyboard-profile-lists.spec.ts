import { expect, type Locator, type Page, test } from "@playwright/test";

import { openAlbums, SHARED_ALBUM } from "./support/albums";
import {
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	pathname,
} from "./support/app";
import { arrowThrough, focusProblems } from "./support/focus";

const BLOCKED_LIST = "/settings/account/blocked";
const ROWS = '[data-slot="profile-list-rows"]';
const ROW = '[data-slot="profile-list-row"]';
const BLOCKED_ROWS = 12;
const TAB_LIMIT = 40;
const SHORT_VIEWPORT = { width: 1280, height: 420 };

type FocusedCell = { row: number; cell: "link" | "control" | null };

test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false });
test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

async function openBlockedList(page: Page): Promise<void> {
	await page.goto(BLOCKED_LIST);
	await page
		.getByRole("switch")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(page.getByRole("switch")).toHaveCount(BLOCKED_ROWS);
}

function focusedCell(page: Page): Promise<FocusedCell | null> {
	return page.evaluate((rowSelector) => {
		const focused = document.activeElement;
		const row = focused?.closest(rowSelector);
		if (!focused || !row) return null;
		const rows = [...document.querySelectorAll(rowSelector)];
		return {
			row: rows.indexOf(row),
			cell: focused.matches("a")
				? "link"
				: focused.matches("button")
					? "control"
					: null,
		};
	}, ROW);
}

function focusedInsideBand(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const focused = document.activeElement;
		let scroller = focused?.parentElement ?? null;
		while (
			scroller &&
			!/auto|scroll/.test(getComputedStyle(scroller).overflowY)
		)
			scroller = scroller.parentElement;
		if (!focused || !scroller) return false;
		const view = scroller.getBoundingClientRect();
		const style = getComputedStyle(scroller);
		const box = focused.getBoundingClientRect();
		return (
			box.top >=
				view.top + Number.parseFloat(style.scrollPaddingTop) - 1 &&
			box.bottom <=
				view.bottom - Number.parseFloat(style.scrollPaddingBottom) + 1
		);
	});
}

async function openSharedWithFromKeyboard(page: Page): Promise<Locator> {
	await openAlbums(page);
	await page.locator(SHARED_ALBUM).click();
	const sharedWith = page.getByRole("button", { name: /^Shared with/ });
	await expect(sharedWith).toBeEnabled({ timeout: 30_000 });
	await sharedWith.focus();
	await page.keyboard.press("Enter");
	const dialog = page.getByRole("dialog");
	await page.getByRole("checkbox").first().waitFor({ timeout: 30_000 });
	return dialog;
}

async function tabStopsInside({
	page,
	list,
	from,
}: {
	page: Page;
	list: Locator;
	from: "documentStart" | "currentFocus";
}): Promise<{ inside: number; leftList: boolean }> {
	if (from === "documentStart")
		await page.evaluate(() =>
			(document.activeElement as HTMLElement | null)?.blur(),
		);
	let inside = 0;
	for (let i = 0; i < TAB_LIMIT; i++) {
		await page.keyboard.press("Tab");
		const within = await list.evaluate((node) =>
			node.contains(document.activeElement),
		);
		if (within) inside++;
		else if (inside > 0) return { inside, leftList: true };
	}
	return { inside, leftList: false };
}

test.describe("the blocked list from the keyboard", () => {
	test("is one Tab stop", async ({ page }) => {
		await openBlockedList(page);

		const crossing = await tabStopsInside({
			page,
			list: page.locator(ROWS),
			from: "documentStart",
		});

		expect(crossing).toEqual({ inside: 1, leftList: true });
	});

	test("walks the rows with a visible, unclipped ring", async ({ page }) => {
		await openBlockedList(page);

		const links = await arrowThrough(page, {
			start: page.locator(ROW).first().getByRole("link"),
			key: "ArrowDown",
			stops: BLOCKED_ROWS,
		});
		await page.keyboard.press("ArrowRight");
		const switches = await arrowThrough(page, {
			key: "ArrowUp",
			stops: BLOCKED_ROWS,
		});

		expect(links).toHaveLength(BLOCKED_ROWS);
		expect(switches).toHaveLength(BLOCKED_ROWS);
		expect(focusProblems([...links, ...switches])).toEqual([]);
	});

	test("keeps the column when moving between rows", async ({ page }) => {
		await openBlockedList(page);
		await page.locator(ROW).first().getByRole("link").focus();

		await page.keyboard.press("ArrowRight");
		expect(await focusedCell(page)).toEqual({ row: 0, cell: "control" });
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowDown");
		expect(await focusedCell(page)).toEqual({ row: 2, cell: "control" });
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("ArrowUp");
		expect(await focusedCell(page)).toEqual({ row: 1, cell: "link" });
		await page.keyboard.press("End");
		expect(await focusedCell(page)).toEqual({
			row: BLOCKED_ROWS - 1,
			cell: "link",
		});
		await page.keyboard.press("Home");
		expect(await focusedCell(page)).toEqual({ row: 0, cell: "link" });
	});

	test("pages down to a row that stays fully in view", async ({ page }) => {
		await openBlockedList(page);
		await page.locator(ROW).first().getByRole("link").focus();

		await page.keyboard.press("PageDown");

		await expect
			.poll(async () => (await focusedCell(page))?.row ?? 0)
			.toBeGreaterThan(1);
		expect(
			focusProblems(
				await arrowThrough(page, { key: "ArrowDown", stops: 1 }),
			),
		).toEqual([]);
	});

	test("keeps focus on a switch toggled from the keyboard", async ({
		page,
	}) => {
		await openBlockedList(page);
		const toggle = page.getByRole("switch", { name: "Blocked: ID 100802" });
		await toggle.focus();

		await page.keyboard.press("Space");

		await expect(toggle).toHaveAttribute("aria-checked", "false");
		await expect(toggle).toBeFocused();
		await expect(toggle).toHaveAttribute("aria-disabled", "false");
		await page.keyboard.press("Space");
		await expect(toggle).toHaveAttribute("aria-checked", "true");
		await expect(toggle).toBeFocused();
	});

	test("keeps the focused row in view through a virtualized End and PageUp", async ({
		page,
	}) => {
		await page.setViewportSize(SHORT_VIEWPORT);
		await page.goto(BLOCKED_LIST);
		const firstLink = page.locator(ROW).first().getByRole("link");
		await firstLink.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		expect(await page.locator(ROW).count()).toBeLessThan(BLOCKED_ROWS);
		await firstLink.focus();

		await page.keyboard.press("End");
		await expect(page.locator(ROWS)).toHaveCSS("padding-bottom", "0px");
		await expect
			.poll(async () => (await focusedCell(page))?.row)
			.toBe((await page.locator(ROW).count()) - 1);
		await expect.poll(() => focusedInsideBand(page)).toBe(true);

		await page.keyboard.press("PageUp");
		await expect.poll(() => focusedInsideBand(page)).toBe(true);
		expect(await focusedCell(page)).toMatchObject({ cell: "link" });
		expect(
			focusProblems(
				await arrowThrough(page, { key: "ArrowUp", stops: 1 }),
			),
		).toEqual([]);
	});

	test("puts focus back on the row a profile was opened from after Back", async ({
		page,
	}) => {
		await openBlockedList(page);
		await page.locator(ROW).first().getByRole("link").focus();
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowDown");
		const opened = await page.evaluate(() =>
			document.activeElement?.getAttribute("href"),
		);

		await page.keyboard.press("Enter");
		await expect.poll(() => pathname(page)).toBe(opened);
		await page.goBack();

		await expect
			.poll(() => focusedCell(page))
			.toEqual({ row: 2, cell: "link" });
	});
});

test.describe("the album Shared with dialog from the keyboard", () => {
	test("opens on the dialog and holds the list in one Tab stop", async ({
		page,
	}) => {
		const dialog = await openSharedWithFromKeyboard(page);
		await expect(dialog).toBeFocused();

		const crossing = await tabStopsInside({
			page,
			list: dialog.locator(ROWS),
			from: "currentFocus",
		});
		expect(crossing).toEqual({ inside: 1, leftList: true });

		const walk = await arrowThrough(page, {
			start: dialog.locator(ROW).first().getByRole("checkbox"),
			key: "ArrowDown",
			stops: 6,
		});
		expect(walk).toHaveLength(6);
		expect(focusProblems(walk)).toEqual([]);
	});

	test("keeps focus on a checkbox toggled from the keyboard and marks it busy while saving", async ({
		page,
	}) => {
		const dialog = await openSharedWithFromKeyboard(page);
		const checkbox = dialog.locator(ROW).first().getByRole("checkbox");
		await checkbox.focus();
		const busyStates = await checkbox.evaluateHandle((node) => {
			const seen: (string | null)[] = [];
			new MutationObserver(() =>
				seen.push(node.getAttribute("aria-disabled")),
			).observe(node, { attributeFilter: ["aria-disabled"] });
			return seen;
		});

		await page.keyboard.press("Space");

		await expect(checkbox).toHaveAttribute("aria-checked", "false");
		await expect(checkbox).toHaveAttribute("aria-disabled", "false");
		await expect(checkbox).toBeFocused();
		expect(await busyStates.evaluate((seen) => seen)).toEqual([
			"true",
			"false",
		]);
		await page.keyboard.press("Space");
		await expect(checkbox).toHaveAttribute("aria-checked", "true");
		await expect(checkbox).toBeFocused();
	});
});
