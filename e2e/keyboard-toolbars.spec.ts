import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	openGrid,
	pathname,
} from "./support/app";
import { arrowThrough, focusProblems } from "./support/focus";
import { goToRightNow, RIGHT_NOW_FEED_TIMEOUT } from "./support/right-now";

const PHONE = { width: 420, height: 800 };
const DESKTOP = { width: 1280, height: 800 };
const COLLAPSED_SELECTION_BAR = { width: 290, height: 800 };
const DEMO_PROFILE = "/profile/100001";

const navTabs = (page: Page) =>
	page
		.getByRole("navigation", { name: "Main" })
		.getByRole("toolbar", { name: "Sections" });
const quickFilters = (page: Page) =>
	page.getByRole("toolbar", { name: "Quick filters" });
const inboxFilters = (page: Page) =>
	page.getByRole("toolbar", { name: "Conversation filters" });
const conversationRows = (page: Page) =>
	page.locator("a[href^='/chat/']:visible");

function isFocused(target: Locator): Promise<boolean> {
	return target.evaluate((node) => node === document.activeElement);
}

function focusInside(container: Locator): Promise<boolean> {
	return container.evaluate((node) => node.contains(document.activeElement));
}

async function focusFromKeyboard(target: Locator): Promise<void> {
	await target.focus();
	await target.page().keyboard.press("Tab");
	await target.page().keyboard.press("Shift+Tab");
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

async function walkNames({
	page,
	start,
	key,
	stops,
}: {
	page: Page;
	start: Locator;
	key: string;
	stops: number;
}): Promise<string[]> {
	await start.focus();
	const names = [await focusedName(page)];
	for (let i = 1; i < stops; i++) {
		await page.keyboard.press(key);
		names.push(await focusedName(page));
	}
	return names;
}

async function expectOneTabStop({
	page,
	toolbar,
	stop,
}: {
	page: Page;
	toolbar: Locator;
	stop: Locator;
}): Promise<void> {
	await stop.focus();
	await page.keyboard.press("Tab");
	expect(await focusInside(toolbar)).toBe(false);
	await page.keyboard.press("Shift+Tab");
	expect(await isFocused(stop)).toBe(true);
	await page.keyboard.press("Shift+Tab");
	expect(await focusInside(toolbar)).toBe(false);
}

async function expectVisibleArrowLoop({
	page,
	toolbar,
	count,
}: {
	page: Page;
	toolbar: Locator;
	count: number;
}): Promise<void> {
	for (const key of ["ArrowRight", "ArrowLeft"]) {
		await focusFromKeyboard(toolbar.locator("[tabindex]").first());
		const stops = await arrowThrough(page, { key, stops: count + 2 });
		expect(stops).toHaveLength(count);
		expect(focusProblems(stops)).toEqual([]);
	}
}

async function openInbox(page: Page): Promise<void> {
	await page.goto("/chat");
	await conversationRows(page)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

test.describe("the navigation bar", () => {
	test.use({ viewport: PHONE, hasTouch: false });

	test("is one Tab stop that rests on the current section", async ({
		page,
	}) => {
		await openInbox(page);
		const inbox = navTabs(page).getByRole("link", { name: "Inbox" });
		await expect(inbox).toHaveAttribute("aria-current", "page");
		await expect(inbox).toHaveAttribute("tabindex", "0");
		await expectOneTabStop({ page, toolbar: navTabs(page), stop: inbox });
		await inbox.focus();
		await page.keyboard.press("ArrowLeft");
		await expect(inbox).toHaveAttribute("tabindex", "-1");
		await page.keyboard.press("Shift+Tab");
		await expect(inbox).toHaveAttribute("tabindex", "0");
	});

	test("loops through every section with the arrow keys, visibly", async ({
		page,
	}) => {
		await openGrid(page);
		await expectVisibleArrowLoop({
			page,
			toolbar: navTabs(page),
			count: 5,
		});
		const browse = navTabs(page).getByRole("link", { name: "Browse" });
		await browse.focus();
		await page.keyboard.press("End");
		expect(await focusedName(page)).toBe("Me");
		await page.keyboard.press("Home");
		expect(await isFocused(browse)).toBe(true);
	});

	test("rests on the first section on a profile and keeps arrows from paging profiles", async ({
		page,
	}) => {
		await page.goto(DEMO_PROFILE);
		const browse = navTabs(page).getByRole("link", { name: "Browse" });
		await browse.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await expect(browse).toHaveAttribute("tabindex", "0");
		await browse.focus();
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("ArrowRight");
		expect(await focusedName(page)).toBe("Right Now");
		expect(await pathname(page)).toBe(DEMO_PROFILE);
		await page.keyboard.press("Shift+Tab");
		expect(await focusInside(navTabs(page))).toBe(false);
		await page.keyboard.press("Tab");
		expect(await isFocused(browse)).toBe(true);
	});
});

test.describe("the quick filter bars", () => {
	test.use({ viewport: PHONE, hasTouch: false });

	test("Browse walks its chips with the arrow keys and loops", async ({
		page,
	}) => {
		await openGrid(page);
		const names = await walkNames({
			page,
			start: quickFilters(page).getByRole("button", {
				name: "Change location",
			}),
			key: "ArrowRight",
			stops: 9,
		});
		expect(names).toEqual([
			"Change location",
			"All filters",
			"Age",
			"Position",
			"Online",
			"Right Now",
			"Fresh",
			"Command Center",
			"Change location",
		]);
		await expectVisibleArrowLoop({
			page,
			toolbar: quickFilters(page),
			count: 8,
		});
	});

	test("Right Now is one Tab stop walked by the arrow keys", async ({
		page,
	}) => {
		await goToRightNow(page);
		await page
			.getByRole("article")
			.first()
			.waitFor({ timeout: RIGHT_NOW_FEED_TIMEOUT });
		const toolbar = quickFilters(page);
		await expectVisibleArrowLoop({ page, toolbar, count: 5 });
		const age = toolbar.getByRole("button", { name: "Age" });
		await age.focus();
		await expectOneTabStop({ page, toolbar, stop: age });
		await age.focus();
		await page.keyboard.press("End");
		expect(await focusedName(page)).toBe("Hosting");
	});

	test("a pressed toggle keeps focus and becomes the Tab stop on click", async ({
		page,
	}) => {
		await openGrid(page);
		const online = quickFilters(page).getByRole("button", {
			name: "Online",
		});
		await expect(online).toHaveAttribute("aria-pressed", "false");
		await online.click();
		await expect(online).toHaveAttribute("aria-pressed", "true");
		await expect(online).toHaveAttribute("tabindex", "0");
		await page.keyboard.press("Space");
		await expect(online).toHaveAttribute("aria-pressed", "false");
		expect(await isFocused(online)).toBe(true);
	});

	test("chips that open drawers say so and describe their applied state", async ({
		page,
	}) => {
		await goToRightNow(page);
		const sort = quickFilters(page).getByRole("button", { name: /^Sort/ });
		await expect(sort).not.toHaveAttribute("aria-haspopup");
		const age = quickFilters(page).getByRole("button", { name: "Age" });
		await expect(age).toHaveAttribute("aria-haspopup", "dialog");
		await expect(age).toHaveAttribute("aria-expanded", "false");
		await expect(age).not.toHaveAccessibleDescription("Applied");
		await age.focus();
		await page.keyboard.press("Enter");
		await expect(page.getByRole("dialog")).toBeVisible();
		await expect(age).toHaveAttribute("aria-expanded", "true");
		await page.getByRole("switch").click();
		await page.getByRole("button", { name: "Apply" }).click();
		await expect(age).toHaveAttribute("aria-expanded", "false");
		await expect(age).toHaveAccessibleDescription("Applied");
	});

	test("the inbox filters are one Tab stop walked by the arrow keys", async ({
		page,
	}) => {
		await openInbox(page);
		const toolbar = inboxFilters(page);
		await expectVisibleArrowLoop({ page, toolbar, count: 6 });
		const online = toolbar.getByRole("button", { name: "Online" });
		await online.focus();
		await expectOneTabStop({ page, toolbar, stop: online });
	});
});

test.describe("the inbox selection bar", () => {
	test.use({ viewport: PHONE, hasTouch: false });

	test("is one Tab stop whose actions loop under the arrow keys", async ({
		page,
	}) => {
		await openInbox(page);
		await conversationRows(page).nth(1).click({ button: "right" });
		const toolbar = page
			.getByRole("navigation", { name: "Selection" })
			.getByRole("toolbar", { name: "Selection actions" });
		await toolbar.waitFor();
		await expectVisibleArrowLoop({ page, toolbar, count: 4 });
		const pin = toolbar.getByRole("button", { name: "Pin selected" });
		await pin.focus();
		await expectOneTabStop({ page, toolbar, stop: pin });
	});

	test("stays two plain Tab stops when collapsed to a menu", async ({
		page,
	}) => {
		await page.setViewportSize(COLLAPSED_SELECTION_BAR);
		await openInbox(page);
		await conversationRows(page).nth(1).click({ button: "right" });
		const bar = page.getByRole("navigation", { name: "Selection" });
		const exit = bar.getByRole("button", { name: "Exit selection" });
		await exit.waitFor();
		await expect(bar.getByRole("toolbar")).toHaveCount(0);
		await exit.focus();
		await page.keyboard.press("ArrowRight");
		expect(await isFocused(exit)).toBe(true);
		await page.keyboard.press("Tab");
		expect(
			await isFocused(
				bar.getByRole("button", { name: "Selection actions" }),
			),
		).toBe(true);
	});
});

test.describe("the filter chip groups", () => {
	test.use({ viewport: PHONE, hasTouch: false });

	const allFilters = (page: Page) => page.getByRole("dialog");
	const genders = (page: Page) =>
		allFilters(page).getByRole("group", { name: "Gender" });

	test.beforeEach(async ({ page }) => {
		await openGrid(page);
		await quickFilters(page)
			.getByRole("button", { name: "All filters" })
			.click();
		await genders(page)
			.getByRole("button", { name: "Not Specified" })
			.waitFor();
	});

	async function expectOneArrowWalkedStop({
		page,
		group,
	}: {
		page: Page;
		group: Locator;
	}): Promise<void> {
		const chips = group.locator("[data-slot=toggle-group-item]");
		const count = await chips.count();
		await focusFromKeyboard(chips.first());
		const stops = await arrowThrough(page, {
			key: "ArrowRight",
			stops: count + 2,
		});
		expect(stops).toHaveLength(count);
		expect(focusProblems(stops)).toEqual([]);
		await chips.nth(1).focus();
		await page.keyboard.press("Tab");
		expect(
			await chips.evaluateAll((nodes) =>
				nodes.includes(document.activeElement as HTMLElement),
			),
		).toBe(false);
		await page.keyboard.press("Shift+Tab");
		expect(await isFocused(chips.nth(1))).toBe(true);
	}

	test("each group is one Tab stop walked by the arrow keys", async ({
		page,
	}) => {
		for (const name of ["Gender", "Photos", "Position"]) {
			await expectOneArrowWalkedStop({
				page,
				group: allFilters(page).getByRole("group", { name }),
			});
		}
	});

	test("an option list opened from its checkbox is one Tab stop walked by the arrow keys", async ({
		page,
	}) => {
		await allFilters(page)
			.getByRole("checkbox", { name: "Body Type" })
			.click();
		const group = allFilters(page).getByRole("group", {
			name: "Body Type",
		});
		await group.locator("[data-slot=toggle-group-item]").first().waitFor();
		await expectOneArrowWalkedStop({ page, group });
	});

	test("the tag chips are one Tab stop walked by the arrow keys", async ({
		page,
	}) => {
		await allFilters(page).getByRole("checkbox", { name: "Tags" }).click();
		const group = allFilters(page).getByRole("group", { name: "Tags" });
		await group.locator("[data-slot=toggle-group-item]").first().waitFor();
		await expectOneArrowWalkedStop({ page, group });
	});

	test("hiding the remembered gender keeps the group reachable", async ({
		page,
	}) => {
		await genders(page).getByRole("button", { name: "More" }).click();
		const bigender = genders(page).getByRole("button", {
			name: "Bigender",
		});
		await genders(page)
			.getByRole("button", { name: "Men", exact: true })
			.focus();
		await page.keyboard.press("End");
		await page.keyboard.press("ArrowLeft");
		expect(await isFocused(bigender)).toBe(true);
		await page.keyboard.press("Tab");
		expect(await focusedName(page)).toBe("Less");
		await page.keyboard.press("Enter");
		await expect(bigender).toHaveCount(0);
		await page.keyboard.press("Shift+Tab");
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						document.activeElement?.getAttribute("data-slot") ??
						null,
				),
			)
			.toBe("toggle-group-item");
		expect(await focusInside(genders(page))).toBe(true);
	});

	test("the tag chips follow a search", async ({ page }) => {
		await allFilters(page).getByRole("checkbox", { name: "Tags" }).click();
		const tags = allFilters(page).getByRole("group", { name: "Tags" });
		const firstTag = tags.locator("[data-slot=toggle-group-item]").first();
		await firstTag.waitFor();
		await firstTag.focus();
		await page.keyboard.press("ArrowRight");
		await allFilters(page).getByRole("searchbox").fill("coffee");
		const coffee = tags.getByRole("button", {
			name: "Coffee",
			exact: true,
		});
		await coffee.waitFor();
		await expect(coffee).toHaveAttribute("tabindex", "0");
	});
});

test.describe("the conversation split view separator", () => {
	test.use({ viewport: DESKTOP, hasTouch: false });

	const separator = (page: Page) =>
		page.getByRole("separator", { name: "Resize conversation list" });
	const listSize = async (page: Page) =>
		Number(await separator(page).getAttribute("aria-valuenow"));

	test.beforeEach(async ({ page }) => {
		await openInbox(page);
		await expect(separator(page)).toHaveAttribute(
			"aria-orientation",
			"vertical",
		);
		await separator(page).focus();
	});

	test("moves in small steps and restores the size it had before collapsing", async ({
		page,
	}) => {
		const start = await listSize(page);
		await page.keyboard.press("ArrowRight");
		await expect.poll(() => listSize(page)).toBe(start + 5);
		await page.keyboard.press("ArrowLeft");
		await expect.poll(() => listSize(page)).toBe(start);
		await page.keyboard.press("Enter");
		await expect.poll(() => listSize(page)).toBeLessThan(start - 10);
		await page.keyboard.press("Enter");
		await expect.poll(() => listSize(page)).toBe(start);
		await page.keyboard.press("Home");
		await expect.poll(() => listSize(page)).toBeLessThan(start - 10);
		await page.keyboard.press("Enter");
		await expect.poll(() => listSize(page)).toBe(start);
		await page.keyboard.press("End");
		await expect.poll(() => listSize(page)).toBeGreaterThan(start + 10);
	});

	test("keeps Home collapsing the list in a right-to-left layout", async ({
		page,
	}) => {
		const start = await listSize(page);
		await page.evaluate(() => {
			document.documentElement.dir = "rtl";
		});
		await page.keyboard.press("End");
		await expect.poll(() => listSize(page)).toBeGreaterThan(start + 10);
		await page.keyboard.press("Home");
		await expect.poll(() => listSize(page)).toBeLessThan(start - 10);
	});
});
