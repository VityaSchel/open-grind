import { expect, type Locator, test } from "@playwright/test";

import {
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	openGrid,
} from "./support/app";
import { DRAWER } from "./support/drawer";

const HOSTING_AUTHOR = "/profile/100006";
const HOSTING_AUTHOR_CONVERSATION = "/chat/100006:123456000";
const HOSTING_AUTHOR_CHAT = `a[href="${HOSTING_AUTHOR_CONVERSATION}"]`;
const HOSTING_AUTHOR_POST_TEXT = "Gym's done, now what?";
const TILE = 'a[href^="/profile/"]';
const INDICATOR = '[data-slot="right-now-indicator"]';
const PROFILE_SCROLLER = '[data-slot="profile-scroller"]';

async function layoutBox(target: Locator) {
	const box = await target.boundingBox();
	if (box === null) throw new Error("the element is not laid out");
	return box;
}

async function clickOver(
	container: Locator,
	{ target }: { target: Locator },
): Promise<void> {
	const outer = await layoutBox(container);
	const inner = await layoutBox(target);
	await container.click({
		position: {
			x: inner.x - outer.x + inner.width / 2,
			y: inner.y - outer.y + inner.height / 2,
		},
	});
}

test.beforeEach(async ({ page }) => {
	test.setTimeout(240_000);
	await installTauriShim(page);
});

test("Browse's Right Now filter lists only tiles marked as on Right Now", async ({
	page,
}) => {
	await openGrid(page);

	await page.getByRole("button", { name: "Right Now", exact: true }).click();

	const tiles = page.locator(TILE);
	await expect(tiles.first()).toBeVisible({
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	await expect
		.poll(async () => {
			const total = await tiles.count();
			const marked = await tiles
				.filter({ has: page.locator(INDICATOR) })
				.count();
			return total > 0 && total === marked;
		})
		.toBe(true);
	await expect(
		tiles.locator(`${INDICATOR}[title="Right Now · Hosting"]`).first(),
	).toBeVisible();
});

test("a hosting author's profile shows the status and the post, which opens full screen to be reported", async ({
	page,
}) => {
	await page.goto(HOSTING_AUTHOR);

	await expect(
		page.locator('[data-slot="profile-right-now-badge"]'),
	).toHaveText("Hosting", { timeout: FIRST_ROUTE_COMPILE_MS });
	const post = page.getByRole("region", { name: "Right Now" });
	await expect(post).toBeVisible();
	await expect(post.getByRole("button")).toHaveText(["Right Now"]);

	await clickOver(post, { target: post.getByText(HOSTING_AUTHOR_POST_TEXT) });
	const viewer = page.locator(".pswp");
	await expect(viewer).toContainText(HOSTING_AUTHOR_POST_TEXT);
	await expect(viewer.getByRole("button", { name: "Edit post" })).toHaveCount(
		0,
	);
	await viewer.getByRole("button", { name: "Report post" }).click();
	await expect(viewer).toHaveCount(0);
	const drawer = page.locator(DRAWER);
	await drawer.waitFor({ timeout: 10_000 });
	await expect(
		drawer.getByRole("heading", { name: "Report post" }),
	).toBeVisible();
});

test("Write a message stays clickable while the Right Now post is scrolled under the chat bar", async ({
	page,
}) => {
	await page.goto(HOSTING_AUTHOR);
	const post = page.getByRole("region", { name: "Right Now" });
	await expect(post).toContainText(HOSTING_AUTHOR_POST_TEXT, {
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	const write = page
		.getByRole("navigation", { name: "Chat and tap" })
		.getByRole("link", { name: "Write a message..." });
	await expect(write).toBeVisible();

	const writeBox = await layoutBox(write);
	const writeCenter = writeBox.y + writeBox.height / 2;
	const postBox = await layoutBox(post);
	await page
		.locator(PROFILE_SCROLLER)
		.evaluate(
			(scroller, top) => scroller.scrollBy({ top, behavior: "instant" }),
			postBox.y + postBox.height / 2 - writeCenter,
		);
	await expect
		.poll(
			async () => {
				const { y, height } = await layoutBox(post);
				return y < writeCenter && writeCenter < y + height;
			},
			{ message: "the post straddles the link's vertical center" },
		)
		.toBe(true);

	await write.click();

	await expect(page).toHaveURL(new RegExp(`${HOSTING_AUTHOR_CONVERSATION}$`));
});

test("the inbox marks a conversation with someone on Right Now", async ({
	page,
}) => {
	await page.goto("/chat");

	await expect(
		page.locator(`${HOSTING_AUTHOR_CHAT} ${INDICATOR}`),
	).toHaveAttribute("title", "Right Now · Hosting", {
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	await expect(
		page.locator(`a[href="/chat/100001:123456000"] ${INDICATOR}`),
	).toHaveCount(0);
});
