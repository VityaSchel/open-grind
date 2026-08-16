import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const BLOCKED_LIST = "/settings/account/blocked";

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

test("account settings link to the profile lists", async ({ page }) => {
	await page.goto("/settings/account");

	for (const [name, href] of [
		["Blocked users", BLOCKED_LIST],
		["Hidden users", "/settings/account/hidden"],
	]) {
		await expect(page.getByRole("link", { name })).toHaveAttribute(
			"href",
			href!,
		);
	}
	await expect(page.getByRole("link", { name: "Starred users" })).toHaveCount(
		0,
	);
});

test("the hidden list renders its own empty state", async ({ page }) => {
	await page.goto("/settings/account/hidden");
	await expect(page.getByText("No Hidden Users")).toBeVisible({
		timeout: 60_000,
	});
});

test("blocked profiles that cannot be resolved still get a row", async ({
	page,
}) => {
	await page.goto(BLOCKED_LIST);

	const switches = page.getByRole("switch");
	await switches.first().waitFor({ timeout: 60_000 });
	await expect(switches).toHaveCount(12);

	await expect(page.getByText("Unavailable profile")).toBeVisible();
	await expect(page.getByText("ID: 100802")).toBeVisible();
	await expect(
		page.getByRole("switch", { name: "Blocked: ID 100802" }),
	).toBeVisible();
});

test("unblocking flips the row in place without leaving the list", async ({
	page,
}) => {
	await page.goto(BLOCKED_LIST);

	const unavailable = page.getByRole("switch", {
		name: "Blocked: ID 100802",
	});
	await unavailable.waitFor({ timeout: 60_000 });
	await expect(unavailable).toHaveAttribute("aria-checked", "true");

	await unavailable.click();

	await expect(unavailable).toHaveAttribute("aria-checked", "false");
	await expect(page).toHaveURL(new RegExp(`${BLOCKED_LIST}$`));
	await expect(page.getByRole("switch")).toHaveCount(12);
	await expect(page.getByText("ID: 100802")).toBeVisible();
});

test("the blocked list comes back to where it was scrolled", async ({
	page,
}) => {
	await page.goto(BLOCKED_LIST);
	const scroller = page.locator(".overflow-y-auto").first();
	await page.getByRole("switch").first().waitFor({ timeout: 60_000 });

	await scroller.evaluate((node) => node.scrollTo({ top: 400 }));
	await expect
		.poll(() => scroller.evaluate((node) => Math.round(node.scrollTop)))
		.toBe(400);

	// clicking a row that is already on screen keeps playwright from
	// scrolling the list back to the top before the navigation
	const onScreen = await page.evaluate(() =>
		[...document.querySelectorAll('a[href^="/profile/"]')].findIndex(
			(link) => {
				const box = link.getBoundingClientRect();
				return box.top > 100 && box.bottom < 700;
			},
		),
	);
	expect(onScreen).toBeGreaterThan(-1);
	await page.locator('a[href^="/profile/"]').nth(onScreen).click();
	await expect(page).toHaveURL(/\/profile\/\d+$/);

	await page.goBack();
	await expect(page).toHaveURL(new RegExp(`${BLOCKED_LIST}$`));
	await expect
		.poll(() => scroller.evaluate((node) => Math.round(node.scrollTop)))
		.toBe(400);
});
