import { expect, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";
import { MEDIA_TILE, openAttachments } from "./support/drawer";
import { arrowThrough, focusProblems } from "./support/focus";

test.describe.configure({ timeout: 180_000 });

const REACTABLE = "Sed do eiusmod tempor incididunt?";
const MENU = "dialog[open]";
const REACT = { name: "React with fire" };

const messageMenu = (page: Page) =>
	page.getByRole("menu", { name: "Message actions" });

function reactableActions(page: Page) {
	return page
		.getByRole("article")
		.filter({ hasText: REACTABLE })
		.first()
		.getByRole("button", { name: "Message actions" });
}

function focusedName(page: Page): Promise<string> {
	return page.evaluate(() => {
		const focused = document.activeElement as HTMLElement | null;
		return (
			focused?.getAttribute("aria-label") ??
			focused?.innerText.trim() ??
			""
		);
	});
}

async function openConversation(page: Page): Promise<void> {
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	await reactableActions(page).waitFor({ timeout: 60_000 });
}

async function openReactableMenuByKeyboard(page: Page): Promise<void> {
	await reactableActions(page).focus();
	await page.keyboard.press("Enter");
	await expect(messageMenu(page)).toBeVisible();
}

test.describe("message menu", () => {
	test.beforeEach(async ({ page }) => {
		await openConversation(page);
	});

	test("opens as a named menu with the first item focused, and the arrow keys walk and wrap its items", async ({
		page,
	}) => {
		await openReactableMenuByKeyboard(page);
		const items = messageMenu(page).getByRole("menuitem");
		const count = await items.count();
		await expect(items.first()).toBeFocused();
		await expect(items.first()).toHaveAccessibleName(REACT.name);
		await expect(messageMenu(page).locator('[tabindex="0"]')).toHaveCount(
			1,
		);

		const walk = await arrowThrough(page, {
			key: "ArrowDown",
			stops: count + 1,
		});

		expect(walk).toHaveLength(count);
		expect(focusProblems(walk)).toEqual([]);
		await expect(items.first()).toBeFocused();

		await page.keyboard.press("ArrowUp");
		await expect(items.last()).toBeFocused();
		await page.keyboard.press("Home");
		await expect(items.first()).toBeFocused();
		await page.keyboard.press("End");
		await expect(items.last()).toBeFocused();
	});

	test("typing the start of an item's name moves to it", async ({ page }) => {
		await openReactableMenuByKeyboard(page);

		await page.keyboard.press("d");

		expect(await focusedName(page)).toBe("Delete for me");
	});

	test("Tab closes the menu and hands focus back to the message's menu button", async ({
		page,
	}) => {
		await openReactableMenuByKeyboard(page);

		await page.keyboard.press("Tab");

		await expect(page.locator(MENU)).toHaveCount(0);
		await expect(reactableActions(page)).toBeFocused();
	});

	test("Enter on the fire item reacts and closes the menu", async ({
		page,
	}) => {
		await openReactableMenuByKeyboard(page);

		await page.keyboard.press("Enter");

		await expect(page.locator(MENU)).toHaveCount(0);
		await expect(
			page
				.getByRole("article")
				.filter({ hasText: REACTABLE })
				.first()
				.getByRole("img", { name: "Fire reaction" }),
		).toBeVisible();
	});
});

test.describe("message menu on a touch screen", () => {
	test.use({ hasTouch: true, isMobile: true });

	test.beforeEach(async ({ page }) => {
		await openConversation(page);
	});

	test("offers the fire item when the menu was opened from the keyboard", async ({
		page,
	}) => {
		await openReactableMenuByKeyboard(page);

		await expect(
			messageMenu(page).getByRole("menuitem", REACT),
		).toBeVisible();
		await expect(page.getByText("Double tap to")).toBeHidden();
	});

	test("keeps the double-tap hint instead of the fire item when the menu opens from a long press", async ({
		page,
	}) => {
		await page
			.getByRole("article")
			.filter({ hasText: REACTABLE })
			.first()
			.dispatchEvent("contextmenu");

		await expect(messageMenu(page)).toBeVisible();
		await expect(
			messageMenu(page).getByRole("menuitem", REACT),
		).toHaveCount(0);
		await expect(page.getByText("Double tap to")).toBeVisible();
		const walk = await arrowThrough(page, { key: "ArrowDown", stops: 10 });
		expect(walk.map(({ element }) => element)).not.toContain("body");
	});

	test("keeps the double-tap hint when a long press opens the menu while typing in the composer", async ({
		page,
	}) => {
		await page.getByRole("textbox", { name: "Write a message…" }).tap();

		await page
			.getByRole("article")
			.filter({ hasText: REACTABLE })
			.first()
			.dispatchEvent("contextmenu");

		await expect(messageMenu(page)).toBeVisible();
		await expect(
			messageMenu(page).getByRole("menuitem", REACT),
		).toHaveCount(0);
		await expect(page.getByText("Double tap to")).toBeVisible();
	});
});

test("a media tile's menu is a named menu that Tab closes", async ({
	page,
}) => {
	await openAttachments(page);
	const tile = page.locator(MEDIA_TILE).nth(1);
	await tile.focus();

	await page.keyboard.press("ContextMenu");

	const menu = page.getByRole("menu", { name: /^(Photo|Video) options$/ });
	await expect(menu).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: "Delete permanently" }),
	).toBeFocused();
	const walk = await arrowThrough(page, { key: "ArrowDown", stops: 2 });
	expect(walk).toHaveLength(1);
	expect(focusProblems(walk)).toEqual([]);

	await page.keyboard.press("Tab");

	await expect(page.locator(MENU)).toHaveCount(0);
	await expect(tile).toBeFocused();
});
