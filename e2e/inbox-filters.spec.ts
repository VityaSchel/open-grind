import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import { DRAWER } from "./support/drawer";

const CONVERSATION_LINK = 'a[href^="/chat/1"]';

const HENRY = "/chat/100009:123456000";
const THEO = "/chat/100006:123456000";
const JAMES = "/chat/100001:123456000";
const PABLO = "/chat/100777:123456000";
const JACK = "/chat/100250:123456000";
const NAMELESS = "/chat/100333:123456000";
const BEAR = "/chat/100002:123456000";

const EVERY_CONVERSATION = [HENRY, THEO, JAMES, PABLO, JACK, NAMELESS, BEAR];

const VIEWPORT_WIDTH = 420;
const ACTIVE_PILL_BACKGROUND = "rgb(255, 255, 255)";
const DRAWER_ANIMATION_MS = 700;

const pill = (page: Page, name: string) =>
	page.getByRole("button", { name, exact: true });

const drawerBody = (page: Page) => page.locator("[data-slot=drawer-body]");

async function listedConversations(page: Page): Promise<string[]> {
	const hrefs = await page
		.locator(CONVERSATION_LINK)
		.evaluateAll((links) =>
			links.map((link) => link.getAttribute("href") ?? ""),
		);
	return [...new Set(hrefs)];
}

async function openInbox(page: Page): Promise<void> {
	await installTauriShim(page);
	await page.goto("/chat");
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });
	await expect
		.poll(() => listedConversations(page))
		.toEqual(EVERY_CONVERSATION);
}

async function openFilterDrawer(page: Page, name: string): Promise<void> {
	await pill(page, name).click();
	await page.locator(DRAWER).waitFor({ timeout: 10_000 });
	await page.waitForTimeout(DRAWER_ANIMATION_MS);
}

async function applyFilterDrawer(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Apply" }).click();
	await expect(page.locator(DRAWER)).toBeHidden();
	await page.waitForTimeout(DRAWER_ANIMATION_MS);
}

function filterRow(page: Page, { scrollToEnd = false } = {}) {
	return page.evaluate((toEnd) => {
		const header = document.querySelector<HTMLElement>(
			"[data-fixed-header]",
		);
		const row = [
			...(header?.querySelectorAll<HTMLElement>("div") ?? []),
		].find(
			(candidate) => candidate.scrollWidth > candidate.clientWidth + 1,
		);
		if (!row) return null;
		if (toEnd) row.scrollTo({ left: row.scrollWidth });
		return {
			height: Math.round(row.getBoundingClientRect().height),
			hiddenWidth: row.scrollWidth - row.clientWidth,
		};
	}, scrollToEnd);
}

async function rightEdgeOf(page: Page, name: string): Promise<number> {
	const box = await pill(page, name).boundingBox();
	expect(box).not.toBeNull();
	return box!.x + box!.width;
}

const BOOLEAN_PILLS = [
	{ label: "Unread", matching: [THEO, JAMES, PABLO] },
	{ label: "Online", matching: [JACK] },
	{ label: "Right now", matching: [THEO] },
];

for (const { label, matching } of BOOLEAN_PILLS) {
	test(`the ${label} pill narrows the inbox and gives it back`, async ({
		page,
	}) => {
		await openInbox(page);

		const toggle = pill(page, label);
		await toggle.click();

		await expect(toggle).toHaveAttribute("aria-pressed", "true");
		await expect.poll(() => listedConversations(page)).toEqual(matching);

		await toggle.click();

		await expect(toggle).toHaveAttribute("aria-pressed", "false");
		await expect
			.poll(() => listedConversations(page))
			.toEqual(EVERY_CONVERSATION);
	});
}

test("two pills filter to the intersection, not the union", async ({
	page,
}) => {
	await openInbox(page);

	const unread = pill(page, "Unread");
	await unread.click();
	await expect
		.poll(() => listedConversations(page))
		.toEqual([THEO, JAMES, PABLO]);

	const rightNow = pill(page, "Right now");
	await rightNow.click();
	await expect.poll(() => listedConversations(page)).toEqual([THEO]);

	await rightNow.click();
	await pill(page, "Online").click();

	await expect(
		page.getByText("No conversations match these filters."),
	).toBeVisible();
	expect(await listedConversations(page)).toEqual([]);
});

test("the star keeps the other pills it does not own", async ({ page }) => {
	await openInbox(page);

	const unread = pill(page, "Unread");
	const star = page.getByRole("button", { name: "Favorites only" });
	await unread.click();
	await expect
		.poll(() => listedConversations(page))
		.toEqual([THEO, JAMES, PABLO]);

	await star.click();

	await expect(unread).toHaveAttribute("aria-pressed", "true");
	await expect.poll(() => listedConversations(page)).toEqual([JAMES]);

	await star.click();

	await expect(unread).toHaveAttribute("aria-pressed", "true");
	await expect
		.poll(() => listedConversations(page))
		.toEqual([THEO, JAMES, PABLO]);
});

test("the distance drawer applies its slider value and lights the pill", async ({
	page,
}) => {
	await openInbox(page);

	const distance = pill(page, "Distance");
	const background = () =>
		distance.evaluate((node) => getComputedStyle(node).backgroundColor);
	const restingBackground = await background();
	expect(restingBackground).not.toBe(ACTIVE_PILL_BACKGROUND);

	await openFilterDrawer(page, "Distance");

	const slider = page.getByRole("slider", { name: "Maximum distance" });
	const enabled = page.getByRole("switch", { name: "Filter by distance" });
	await expect(enabled).toHaveAttribute("aria-checked", "false");
	await expect(drawerBody(page)).toHaveText("Within 10 km");

	await slider.focus();
	await page.keyboard.press("ArrowLeft");

	await expect(drawerBody(page)).toHaveText("Within 5 km");
	await expect(enabled).toHaveAttribute("aria-checked", "true");

	await applyFilterDrawer(page);

	await expect
		.poll(() => listedConversations(page))
		.toEqual([HENRY, THEO, JAMES, BEAR]);
	await expect(page.locator(`a[href="${JAMES}"]`).first()).toContainText(
		"James",
	);
	await expect.poll(background).toBe(ACTIVE_PILL_BACKGROUND);

	await openFilterDrawer(page, "Distance");

	await expect(drawerBody(page)).toHaveText("Within 5 km");
	await expect(enabled).toHaveAttribute("aria-checked", "true");

	await enabled.click();
	await expect(enabled).toHaveAttribute("aria-checked", "false");
	await applyFilterDrawer(page);

	await expect
		.poll(() => listedConversations(page))
		.toEqual(EVERY_CONVERSATION);
	await expect.poll(background).toBe(restingBackground);
});

test("the position drawer filters the inbox down to the picked position", async ({
	page,
}) => {
	await openInbox(page);

	await openFilterDrawer(page, "Position");

	const side = page.getByRole("button", { name: "Side", exact: true });
	const enabled = page.getByRole("switch", { name: "Filter by position" });
	await expect(enabled).toHaveAttribute("aria-checked", "false");

	await side.click();

	await expect(side).toHaveAttribute("aria-pressed", "true");
	await expect(enabled).toHaveAttribute("aria-checked", "true");

	await applyFilterDrawer(page);

	await expect.poll(() => listedConversations(page)).toEqual([HENRY, JAMES]);
	await expect
		.poll(() =>
			pill(page, "Position").evaluate(
				(node) => getComputedStyle(node).backgroundColor,
			),
		)
		.toBe(ACTIVE_PILL_BACKGROUND);
});

test("the filter bar scrolls sideways without growing taller", async ({
	page,
}) => {
	await openInbox(page);

	const scroller = page.locator('[data-slot="conversations-scroller"]');
	await expect(scroller).toHaveCSS("padding-top", "60px");

	const resting = await filterRow(page);
	expect(resting, "the filter bar should overflow sideways").not.toBeNull();
	expect(resting!.hiddenWidth).toBeGreaterThan(0);
	expect(await rightEdgeOf(page, "Position")).toBeGreaterThan(VIEWPORT_WIDTH);

	await filterRow(page, { scrollToEnd: true });

	await expect
		.poll(() => rightEdgeOf(page, "Position"))
		.toBeLessThanOrEqual(VIEWPORT_WIDTH);
	expect(await filterRow(page)).toEqual(resting);
	await expect(scroller).toHaveCSS("padding-top", "60px");
});
