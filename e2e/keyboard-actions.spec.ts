import { expect, type Locator, type Page, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";
import { MEDIA_TILE, openAttachments } from "./support/drawer";
import { focusProblems, measureFocusedElement } from "./support/focus";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";
import { activeProfilePane } from "./support/profile-pager";

const DESKTOP = { width: 1280, height: 800 };
const SCROLLER = '[data-slot="conversations-scroller"]';
const CONVERSATION_LINK = '[data-slot="profile-item-link"]';
const SELECTION_TOGGLE = '[data-slot="profile-item-selection-toggle"]';
const ROW_MENU = '[data-slot="context-menu-content"]';
const TILE_MENU = "dialog[open]";
const DEMO_PROFILE = "/profile/100001";
const ROW_ACTIONS = { name: "Conversation actions" };
const CHOOSE_TAP = { name: "Choose a tap" };
const ROW_MENU_ITEMS = ["Pin", "Mute", "Delete"];
const ROUNDS_ON_ONE_PAGE = 2;
const TAP_MENU_ITEMS = [
	"Send a Cookie tap",
	"Send a Fire tap",
	"Send a Demon tap",
];

declare global {
	interface Window {
		__contextMenus?: number;
	}
}

function widthOf(target: Locator): Promise<number> {
	return target.evaluate((node) => node.getBoundingClientRect().width);
}

async function expectShownWithCleanRing(target: Locator): Promise<void> {
	await expect(target).toBeFocused();
	expect(await widthOf(target)).toBeGreaterThan(16);
	const measured = await target.page().evaluate(measureFocusedElement);
	expect(measured).not.toBeNull();
	expect(focusProblems(measured ? [measured.stop] : [])).toEqual([]);
}

async function focusByKeyboard(target: Locator): Promise<void> {
	await target.focus();
	await target.page().keyboard.press("Shift+Tab");
	await target.page().keyboard.press("Tab");
	await expect(target).toBeFocused();
}

async function countContextMenus(page: Page): Promise<() => Promise<number>> {
	await page.evaluate(() => {
		window.__contextMenus = 0;
		window.addEventListener(
			"contextmenu",
			() => {
				window.__contextMenus = (window.__contextMenus ?? 0) + 1;
			},
			{ capture: true },
		);
	});
	return () => page.evaluate(() => window.__contextMenus ?? 0);
}

function menuItemNames(menu: Locator): Promise<string[]> {
	return menu
		.getByRole("menuitem")
		.evaluateAll((items) =>
			items.map(
				(item) =>
					item.getAttribute("aria-label") ??
					item.textContent?.trim() ??
					"",
			),
		);
}

function conversationRows(page: Page): Locator {
	return page.locator(SCROLLER).locator('[data-slot="conversation-row"]');
}

function rowLink(row: Locator): Locator {
	return row.locator(`${CONVERSATION_LINK}:visible`);
}

async function openInbox(page: Page): Promise<void> {
	await installTauriShim(page, { platform: "macos" });
	await page.goto("/chat");
	await rowLink(conversationRows(page).first()).waitFor({
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
}

async function cancelDeleteFromRowMenu(page: Page): Promise<void> {
	const menu = page.locator(ROW_MENU);
	await expect(menu.getByRole("menuitem").first()).toBeFocused();
	await page.keyboard.press("End");
	await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeFocused();
	await page.keyboard.press("Enter");
	const dialog = page.getByRole("alertdialog");
	await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);
	await expect(menu).toHaveCount(0);
}

async function openProfile(page: Page): Promise<Locator> {
	await installTauriShim(page, { platform: "macos" });
	await page.goto(DEMO_PROFILE);
	const nav = activeProfilePane(page).getByRole("navigation", {
		name: "Chat and Tap",
	});
	await nav
		.getByRole("button", { name: "Send a Fire tap" })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	return nav;
}

async function openMediaGrid(page: Page): Promise<Locator> {
	await serveImages(page, CHAT_MEDIA_HOST);
	await openAttachments(page, { platform: "macos" });
	const panel = page.getByRole("tabpanel", { name: "Media" });
	await panel.locator(MEDIA_TILE).nth(2).waitFor();
	return panel;
}

test.describe("the inbox row actions button", () => {
	test("hides from the mouse and shows itself one step right of the conversation link", async ({
		page,
	}) => {
		await openInbox(page);
		const row = conversationRows(page).nth(1);
		const actions = row.getByRole("button", ROW_ACTIONS);

		await row.hover();
		expect(await widthOf(actions)).toBeLessThanOrEqual(1);
		await rowLink(row).focus();
		await page.keyboard.press("ArrowRight");

		await expectShownWithCleanRing(actions);
		await page.keyboard.press("ArrowLeft");
		await expect(rowLink(row)).toBeFocused();
		expect(await widthOf(actions)).toBeLessThanOrEqual(1);
	});

	test("is never a Tab stop of its own", async ({ page }) => {
		await openInbox(page);
		await rowLink(conversationRows(page).first()).focus();

		await page.keyboard.press("Tab");

		const insideList = await page
			.locator(SCROLLER)
			.evaluate((node) => node.contains(document.activeElement));
		expect(insideList).toBe(false);
	});

	test("on a phone, enters selection mode with its row like a long-press", async ({
		page,
	}) => {
		await openInbox(page);
		const row = conversationRows(page).nth(1);
		await rowLink(row).focus();
		await page.keyboard.press("ArrowRight");

		await page.keyboard.press("Enter");

		await expect(
			page.getByRole("button", { name: "Exit selection" }),
		).toBeVisible();
		const toggle = row.locator(SELECTION_TOGGLE);
		await expect(toggle).toBeFocused();
		await expect(toggle).toHaveAttribute("aria-pressed", "true");
		await expect(row.getByRole("button", ROW_ACTIONS)).toHaveCount(0);
	});

	test.describe("beside an open conversation", () => {
		test.use({ viewport: DESKTOP });

		test("opens the row's menu, the same one a right-click opens, and Escape hands focus back", async ({
			page,
		}) => {
			await openInbox(page);
			const row = conversationRows(page).nth(1);
			await rowLink(row).click({ button: "right" });
			const menu = page.locator(ROW_MENU);
			await expect(menu).toBeVisible();
			const rightClickItems = await menuItemNames(menu);
			await page.keyboard.press("Escape");
			await expect(menu).toHaveCount(0);
			const actions = row.getByRole("button", ROW_ACTIONS);
			await focusByKeyboard(rowLink(row));
			await page.keyboard.press("ArrowRight");
			await expect(actions).toHaveAttribute("aria-haspopup", "menu");

			await page.keyboard.press("Enter");

			await expect(menu).toBeVisible();
			await expect(actions).toHaveAttribute("aria-expanded", "true");
			expect(await menuItemNames(menu)).toEqual(rightClickItems);
			expect(rightClickItems).toEqual(ROW_MENU_ITEMS);

			await page.keyboard.press("Escape");

			await expect(menu).toHaveCount(0);
			await expectShownWithCleanRing(actions);
			await expect(actions).toHaveAttribute("aria-expanded", "false");
		});

		for (const key of ["Shift+F10", "ContextMenu"]) {
			test(`${key} on a focused row opens its menu exactly once and Escape returns to the row`, async ({
				page,
			}) => {
				await openInbox(page);
				const link = rowLink(conversationRows(page).nth(1));
				await focusByKeyboard(link);
				const contextMenus = await countContextMenus(page);

				await page.keyboard.press(key);

				const menu = page.locator(ROW_MENU);
				await expect(menu).toHaveCount(1);
				expect(await menuItemNames(menu)).toEqual(ROW_MENU_ITEMS);
				expect(await contextMenus()).toBe(1);

				await page.keyboard.press("Escape");

				await expect(menu).toHaveCount(0);
				await expect(link).toBeFocused();
			});
		}

		test("Delete cancelled from a Shift+F10 menu hands focus back to the row link every time", async ({
			page,
		}) => {
			await openInbox(page);
			const rows = conversationRows(page);
			const link = rowLink(rows.nth(1));
			const rowCount = await rows.count();
			await focusByKeyboard(link);

			for (let round = 0; round < ROUNDS_ON_ONE_PAGE; round++) {
				await page.keyboard.press("Shift+F10");
				await cancelDeleteFromRowMenu(page);

				await expect(link).toBeFocused();
			}
			await expect(rows).toHaveCount(rowCount);
		});

		test("Delete cancelled from the actions button's menu hands focus back to the button every time", async ({
			page,
		}) => {
			await openInbox(page);
			const row = conversationRows(page).nth(1);
			const actions = row.getByRole("button", ROW_ACTIONS);
			await focusByKeyboard(rowLink(row));
			await page.keyboard.press("ArrowRight");

			for (let round = 0; round < ROUNDS_ON_ONE_PAGE; round++) {
				await expect(actions).toBeFocused();
				await page.keyboard.press("Enter");
				await cancelDeleteFromRowMenu(page);

				await expectShownWithCleanRing(actions);
			}
		});
	});
});

test.describe("the Choose a tap button", () => {
	test("hides from the mouse, follows Tap, and opens the tap picker that Escape closes back onto it", async ({
		page,
	}) => {
		const nav = await openProfile(page);
		const tap = nav.getByRole("button", { name: "Send a Fire tap" });
		const choose = nav.getByRole("button", CHOOSE_TAP);
		await nav.hover();
		expect(await widthOf(choose)).toBeLessThanOrEqual(1);
		await expect(tap).toHaveAccessibleDescription(
			"Shift+F10 or the next button offers the other taps",
		);
		await focusByKeyboard(tap);

		await page.keyboard.press("Tab");

		await expectShownWithCleanRing(choose);
		await page.keyboard.press("Enter");
		const picker = page.getByRole("menu");
		await expect(picker).toBeVisible();
		expect(await menuItemNames(picker)).toEqual(TAP_MENU_ITEMS);
		await expect(choose).toHaveAttribute("aria-expanded", "true");

		await page.keyboard.press("Escape");

		await expect(picker).toHaveCount(0);
		await expectShownWithCleanRing(choose);
	});

	test("a tap picked from the Choose a tap menu leaves focus on the sent Tap", async ({
		page,
	}) => {
		const nav = await openProfile(page);
		await focusByKeyboard(
			nav.getByRole("button", { name: "Send a Fire tap" }),
		);
		await page.keyboard.press("Tab");
		await expect(nav.getByRole("button", CHOOSE_TAP)).toBeFocused();
		await page.keyboard.press("Enter");
		const picker = page.getByRole("menu");
		await expect(
			picker.getByRole("menuitem", { name: "Send a Cookie tap" }),
		).toBeFocused();

		await page.keyboard.press("Enter");

		await expect(picker).toHaveCount(0);
		await expect(
			nav.getByRole("button", { name: "Cookie tap sent" }),
		).toBeFocused();
	});

	test("Shift+F10 on the Choose a tap button opens the picker exactly once and Escape returns to it", async ({
		page,
	}) => {
		const nav = await openProfile(page);
		const choose = nav.getByRole("button", CHOOSE_TAP);
		await focusByKeyboard(
			nav.getByRole("button", { name: "Send a Fire tap" }),
		);
		await page.keyboard.press("Tab");
		await expect(choose).toBeFocused();
		const contextMenus = await countContextMenus(page);

		await page.keyboard.press("Shift+F10");

		const picker = page.getByRole("menu");
		await expect(picker).toBeVisible();
		expect(await menuItemNames(picker)).toEqual(TAP_MENU_ITEMS);
		expect(await contextMenus()).toBe(1);

		await page.keyboard.press("Escape");

		await expect(picker).toHaveCount(0);
		await expect(choose).toBeFocused();
	});

	test("leaves Enter on Tap sending a Fire tap, with focus kept on Tap", async ({
		page,
	}) => {
		const nav = await openProfile(page);
		const tap = nav.getByRole("button", { name: "Send a Fire tap" });
		await focusByKeyboard(tap);

		await page.keyboard.press("Enter");

		const sent = nav.getByRole("button", { name: "Fire tap sent" });
		await expect(sent).toBeFocused();
		await expect(sent).toHaveAttribute("aria-disabled", "true");
		await expect(nav.getByRole("button", CHOOSE_TAP)).toHaveCount(0);
		await expect(page.getByRole("menu")).toHaveCount(0);
	});

	test("Shift+F10 on Tap opens the picker exactly once, and a picked tap leaves focus on Tap", async ({
		page,
	}) => {
		const nav = await openProfile(page);
		const tap = nav.getByRole("button", { name: "Send a Fire tap" });
		await focusByKeyboard(tap);
		const contextMenus = await countContextMenus(page);

		await page.keyboard.press("Shift+F10");

		const picker = page.getByRole("menu");
		await expect(picker).toBeVisible();
		expect(await contextMenus()).toBe(1);
		await picker
			.getByRole("menuitem", { name: "Send a Cookie tap" })
			.focus();
		await page.keyboard.press("Enter");

		await expect(picker).toHaveCount(0);
		await expect(
			nav.getByRole("button", { name: "Cookie tap sent" }),
		).toBeFocused();
	});
});

test.describe("the media tile actions button", () => {
	test("is the one Tab stop after the active tile, shows at its corner, and opens the tile menu", async ({
		page,
	}) => {
		const panel = await openMediaGrid(page);
		const tile = panel.locator(MEDIA_TILE).nth(1);
		const actions = panel.getByRole("button", {
			name: /^Photo 2 options$/,
		});
		await expect(
			panel.getByRole("button", { name: / options$/ }),
		).toHaveCount(0);
		await focusByKeyboard(panel.locator(MEDIA_TILE).first());
		await page.keyboard.press("ArrowRight");
		await expect(tile).toBeFocused();

		await page.keyboard.press("Tab");

		await expectShownWithCleanRing(actions);
		await expect(
			panel.getByRole("button", { name: / options$/ }),
		).toHaveCount(1);
		const corner = await actions.evaluate((button) => {
			const shown = button.getBoundingClientRect();
			const tileBox = document
				.querySelectorAll('[data-slot="media-tile"]')[1]!
				.getBoundingClientRect();
			return {
				inside:
					shown.top >= tileBox.top &&
					shown.right <= tileBox.right &&
					shown.bottom <= tileBox.bottom &&
					shown.left >= tileBox.left,
				nearTopEnd:
					shown.top - tileBox.top < 16 &&
					tileBox.right - shown.right < 16,
			};
		});
		expect(corner).toEqual({ inside: true, nearTopEnd: true });
		await expect(actions).toHaveAttribute("aria-haspopup", "menu");

		await page.keyboard.press("Enter");

		const menu = page.getByRole("menu", { name: "Photo options" });
		await expect(
			menu.getByRole("menuitem", { name: "Delete permanently" }),
		).toBeVisible();
		await expect(page.locator(TILE_MENU)).toHaveCount(1);

		await page.keyboard.press("Escape");

		await expect(page.locator(TILE_MENU)).toHaveCount(0);
		await expectShownWithCleanRing(actions);
		await page.keyboard.press("Shift+Tab");
		await expect(tile).toBeFocused();
	});

	test("a mouse never sees it, and a right-click opens the same menu", async ({
		page,
	}) => {
		const panel = await openMediaGrid(page);
		const tile = panel.locator(MEDIA_TILE).nth(1);

		await tile.click({ button: "right" });

		const menu = page.getByRole("menu", { name: "Photo options" });
		await expect(menu).toBeVisible();
		expect(await menuItemNames(menu)).toEqual(["Delete permanently"]);
		await page.keyboard.press("Escape");
		await expect(page.locator(TILE_MENU)).toHaveCount(0);
		await tile.hover();
		const actions = panel.getByRole("button", { name: / options$/ });
		for (const shown of await actions.all())
			expect(await widthOf(shown)).toBeLessThanOrEqual(1);
	});

	test("Shift+F10 on a focused tile opens its menu exactly once", async ({
		page,
	}) => {
		const panel = await openMediaGrid(page);
		const tile = panel.locator(MEDIA_TILE).nth(2);
		await focusByKeyboard(panel.locator(MEDIA_TILE).first());
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("ArrowRight");
		await expect(tile).toBeFocused();
		const contextMenus = await countContextMenus(page);

		await page.keyboard.press("Shift+F10");

		await expect(
			page.getByRole("menuitem", { name: "Delete permanently" }),
		).toBeVisible();
		await expect(page.locator(TILE_MENU)).toHaveCount(1);
		expect(await contextMenus()).toBe(1);

		await page.keyboard.press("Escape");

		await expect(page.locator(TILE_MENU)).toHaveCount(0);
		await expect(tile).toBeFocused();
	});

	test("Shift+F10 on the actions button opens the tile menu exactly once and Escape returns to it", async ({
		page,
	}) => {
		const panel = await openMediaGrid(page);
		const actions = panel.getByRole("button", {
			name: /^Photo 2 options$/,
		});
		await focusByKeyboard(panel.locator(MEDIA_TILE).first());
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Tab");
		await expect(actions).toBeFocused();
		const contextMenus = await countContextMenus(page);

		await page.keyboard.press("Shift+F10");

		await expect(
			page.getByRole("menuitem", { name: "Delete permanently" }),
		).toBeVisible();
		await expect(page.locator(TILE_MENU)).toHaveCount(1);
		expect(await contextMenus()).toBe(1);

		await page.keyboard.press("Escape");

		await expect(page.locator(TILE_MENU)).toHaveCount(0);
		await expect(actions).toBeFocused();
	});
});
