import { expect, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";

const CONVERSATION_LINK = 'a[href^="/chat/1"]';

const scrollerPaddingTop = (page: Page) => () =>
	page
		.locator('[data-slot="conversations-scroller"]')
		.evaluate((node) => getComputedStyle(node).paddingTop);

async function listedConversations(page: Page): Promise<string[]> {
	const hrefs = await page
		.locator(CONVERSATION_LINK)
		.evaluateAll((links) =>
			links.map((link) => link.getAttribute("href") ?? ""),
		);
	return [...new Set(hrefs)];
}

test("the inbox star filter narrows the list to favorites and back", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/chat");
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });

	const unfiltered = await listedConversations(page);
	expect(unfiltered.length).toBeGreaterThan(1);
	expect(unfiltered).toContain(DEMO_CONVERSATION);

	const star = page.getByRole("button", { name: "Favorites only" });
	await star.click();

	await expect
		.poll(() => listedConversations(page))
		.toEqual([DEMO_CONVERSATION]);

	await star.click();

	await expect.poll(() => listedConversations(page)).toEqual(unfiltered);
});

test("unstarring the last favorite leaves the filter with no results", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/chat");
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });

	await page.locator(`a[href="${DEMO_CONVERSATION}"]`).first().click();
	await page.locator('a[href="/profile/100001"]').first().click();
	await page.getByRole("switch", { name: "Remove from favorites" }).click();
	await expect(
		page.getByRole("switch", { name: "Add to favorites" }),
	).toBeVisible();

	await page.locator('nav a[href="/chat"]').first().click();
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });
	await page.getByRole("button", { name: "Favorites only" }).click();

	await expect(page.getByText("No Results")).toBeVisible();
	await expect(
		page.getByText("No conversations match these filters."),
	).toBeVisible();
	expect(await listedConversations(page)).toEqual([]);
});

test("leaving the chat section clears the filter", async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/chat");
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });

	const star = page.getByRole("button", { name: "Favorites only" });
	await star.click();
	await expect(star).toHaveAttribute("aria-pressed", "true");

	await page.locator('nav a[href="/"]').first().click();
	await page.waitForURL("/");
	await page.locator('nav a[href="/chat"]').first().click();
	await page.waitForURL("/chat");
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });

	await expect(
		page.getByRole("button", { name: "Favorites only" }),
	).toHaveAttribute("aria-pressed", "false");
	await expect
		.poll(async () => (await listedConversations(page)).length)
		.toBeGreaterThan(1);
});

test("the filter is session-only and its bar stays pinned while scrolling", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/chat");
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });

	const star = page.getByRole("button", { name: "Favorites only" });
	const barTop = async () => (await star.boundingBox())?.y;
	const restingTop = await barTop();

	const scroller = page.locator('[data-slot="conversations-scroller"]');
	await scroller.evaluate((node) => node.scrollTo({ top: 400 }));
	await expect.poll(barTop).toBe(restingTop);

	await star.click();
	await expect(star).toHaveAttribute("aria-pressed", "true");

	await page.reload();
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });

	await expect(
		page.getByRole("button", { name: "Favorites only" }),
	).toHaveAttribute("aria-pressed", "false");
});

test("the refresh control anchors below the filters bar, not under it", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/chat");
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });

	const bar = page.locator("[data-fixed-header]").first();
	const overlay = page.locator("[data-refresh-phase]");
	await overlay.waitFor({ state: "attached" });

	const barBox = await bar.boundingBox();
	const overlayBox = await overlay.boundingBox();
	expect(barBox).not.toBeNull();
	expect(overlayBox).not.toBeNull();
	expect(Math.round(overlayBox!.y)).toBe(
		Math.round(barBox!.y + barBox!.height),
	);
});

test("selection mode takes the filters bar away and gives it back", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/chat");
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });

	const star = page.getByRole("button", { name: "Favorites only" });
	const unreachable = () =>
		star.evaluate((node) => node.closest("[inert]") !== null);
	await expect(star).toBeVisible();
	expect(await unreachable()).toBe(false);
	const restingPadding = await scrollerPaddingTop(page)();
	expect(restingPadding).toBe("60px");

	await page.locator(CONVERSATION_LINK).first().click({ button: "right" });

	const exitSelection = page.getByRole("button", { name: "Exit selection" });
	await expect(exitSelection).toBeVisible();
	await expect.poll(unreachable).toBe(true);
	await expect.poll(scrollerPaddingTop(page)).not.toBe(restingPadding);

	await exitSelection.click();

	await expect.poll(unreachable).toBe(false);
	await expect.poll(scrollerPaddingTop(page)).toBe(restingPadding);
});
