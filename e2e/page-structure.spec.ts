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
			names: ["Back", "Chat and tap", "Main", "Profile actions"],
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

test("the profile back link sits in a navigation landmark", async ({
	page,
}) => {
	await page.goto(DEMO_PROFILE);

	await expect(
		page
			.getByRole("navigation", { name: "Back" })
			.getByRole("link", { name: "Back" }),
	).toBeVisible({ timeout: FIRST_ROUTE_COMPILE_MS });
});

test("the command palette title exists only while the palette is open", async ({
	page,
}) => {
	await page.goto("/settings");
	await page
		.getByRole("navigation", { name: "Main" })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(page.getByText("Command Palette")).toHaveCount(0);

	await page.keyboard.press("ControlOrMeta+k");

	await expect(
		page.getByRole("dialog", { name: "Command Palette" }),
	).toBeVisible();

	await page.keyboard.press("Escape");

	await expect(page.getByText("Command Palette")).toHaveCount(0);
});

test("the command palette search box names the suggestion list it controls", async ({
	page,
}) => {
	await page.goto("/settings");
	await page
		.getByRole("navigation", { name: "Main" })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

	await page.keyboard.press("ControlOrMeta+k");

	const suggestions = page.getByRole("listbox");
	await expect(suggestions).toBeVisible();
	await expect(page.getByRole("combobox")).toHaveAttribute(
		"aria-controls",
		(await suggestions.getAttribute("id")) ?? "missing list id",
	);
});

test("the report link on the 404 page is a plain link, not a button", async ({
	page,
}) => {
	await page.goto("/definitely-not-a-route");
	const report = page.getByRole("link", { name: "Report an issue" });
	await report.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

	await expect(page.getByRole("button").filter({ has: report })).toHaveCount(
		0,
	);
});
