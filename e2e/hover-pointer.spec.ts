import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	FIRST_ROUTE_COMPILE_MS,
	hoverPen,
	installTauriShim,
} from "./support/app";

test.describe.configure({ timeout: 180_000 });

function background(element: Locator): Promise<string> {
	return element.evaluate((node) => getComputedStyle(node).backgroundColor);
}

async function openBrowseTab(page: Page): Promise<Locator> {
	await installTauriShim(page);
	await page.goto("/");
	const browse = page
		.getByRole("navigation", { name: "Main" })
		.getByRole("link", { name: "Browse" });
	await browse.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	return browse;
}

test("hover styles follow a hovering pointer and stay off after a tap", async ({
	page,
}) => {
	const browse = await openBrowseTab(page);
	const resting = await background(browse);

	await browse.hover();
	await expect(browse).not.toHaveCSS("background-color", resting);
	const hover = await background(browse);

	await browse.tap();
	expect(
		await browse.evaluate((element) => element.matches(":hover")),
		"the tap leaves :hover on the tab",
	).toBe(true);
	await expect(browse).toHaveCSS("background-color", resting);

	const box = await browse.boundingBox();
	if (box === null) throw new Error("The Browse tab has no box");
	await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2);
	await expect(browse).toHaveCSS("background-color", hover);
});

test("a hovering pen shows hover styles", async ({ page }) => {
	const browse = await openBrowseTab(page);
	const resting = await background(browse);

	await hoverPen({ page, target: browse });

	await expect(browse).not.toHaveCSS("background-color", resting);
});

test("a hovering pen highlights the menu item under it", async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/settings/profile");
	const position = page.getByRole("button", { name: /^Position / });
	await position.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await position.tap();
	const item = page.getByRole("menuitemradio").nth(2);
	await item.waitFor();
	await expect(item).not.toBeFocused();

	await hoverPen({ page, target: item });

	await expect(item).toBeFocused();
	await expect(item).toHaveAttribute("data-highlighted");
});

test.describe("with a cursor", () => {
	test.use({ hasTouch: false });

	test("typing in a combobox highlights the first match before the mouse moves", async ({
		page,
	}) => {
		await installTauriShim(page);
		await page.goto("/settings/profile");
		const tags = page.getByRole("combobox", { name: "Tags", exact: true });
		await tags.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await tags.focus();
		await page.keyboard.type("a");

		const highlighted = page.locator(
			'[data-slot="combobox-item"][data-highlighted]',
		);
		await expect(highlighted).toHaveCount(1);
		const resting = await background(
			page
				.locator('[data-slot="combobox-item"]:not([data-highlighted])')
				.first(),
		);
		await expect(highlighted).not.toHaveCSS("background-color", resting);
	});
});
