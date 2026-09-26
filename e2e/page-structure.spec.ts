import { expect, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./support/app";

const DEMO_PROFILE = "/profile/100001";

async function navigationNames(page: Page): Promise<string[]> {
	const navigations = await page.getByRole("navigation").all();
	const names = await Promise.all(
		navigations.map(
			async (navigation) =>
				(await navigation.getAttribute("aria-label")) ?? "",
		),
	);
	return names.toSorted((a, b) => a.localeCompare(b));
}

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

test.describe("every navigation bar has a name of its own", () => {
	const pages = [
		{ path: "/settings/app", names: ["Main", "Page"] },
		{ path: "/interest/taps", names: ["Interest", "Main"] },
		{ path: DEMO_CONVERSATION, names: ["Conversation"] },
		{
			path: DEMO_PROFILE,
			names: ["Chat and tap", "Main", "Profile actions"],
		},
	];
	for (const { path, names } of pages) {
		test(path, async ({ page }) => {
			await page.goto(path);

			await expect
				.poll(() => navigationNames(page), {
					timeout: FIRST_ROUTE_COMPILE_MS,
				})
				.toEqual(names);
		});
	}
});

test.describe("every screen has one main landmark", () => {
	for (const path of ["/right-now", "/interest/views", "/interest/taps"]) {
		test(path, async ({ page }) => {
			await page.goto(path);
			await page
				.getByRole("navigation", { name: "Main" })
				.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

			await expect(page.getByRole("main")).toHaveCount(1);
		});
	}
});
