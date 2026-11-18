import { expect, type Locator, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import {
	commandCenterShortcut,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	openGrid,
} from "./support/app";
import { answerDemoRequests } from "./support/demo-faults";
import { focusProblems, measureFocusedElement } from "./support/focus";

const PLACES = [
	{ name: "Paris", address: "France", lat: 48.8566, lon: 2.3522 },
	{ name: "Paris", address: "Texas", lat: 33.6609, lon: -95.5555 },
	{ name: "Paris", address: "Ontario", lat: 43.1939, lon: -80.3845 },
];

test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false });
test.describe.configure({ timeout: 240_000 });

async function focusedProblems(page: Page): Promise<string[]> {
	const measured = await page.evaluate(measureFocusedElement);
	return measured ? focusProblems([measured.stop]) : ["body: no focus"];
}

async function isFocused(locator: Locator): Promise<boolean> {
	return locator.evaluate((node) => node === document.activeElement);
}

async function watchLastKeydown(
	page: Page,
): Promise<() => Promise<boolean | undefined>> {
	await page.evaluate(() => {
		const store = window as unknown as { __lastKeydown?: KeyboardEvent };
		window.addEventListener(
			"keydown",
			(event) => {
				store.__lastKeydown = event;
			},
			{ capture: true },
		);
	});
	return () =>
		page.evaluate(
			() =>
				(window as unknown as { __lastKeydown?: KeyboardEvent })
					.__lastKeydown?.defaultPrevented,
		);
}

test.describe("the age wheel", () => {
	test.beforeEach(async ({ page }) => {
		await installTauriShim(page, { platform: "macos" });
		await page.goto("/settings/profile");
	});

	test("is one Tab stop between the name field and the age switch, with a visible ring", async ({
		page,
	}) => {
		const age = page.getByRole("slider", { name: "Age", exact: true });
		await age.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await page
			.getByRole("textbox", { name: "Display name", exact: true })
			.focus();

		await page.keyboard.press("Tab");
		await expect(age).toBeFocused();
		expect(await focusedProblems(page)).toEqual([]);

		await page.keyboard.press("Tab");
		await expect(
			page.getByRole("switch", { name: "Show my age", exact: true }),
		).toBeFocused();
	});

	test("takes slider keys and keeps the value it was given", async ({
		page,
	}) => {
		const age = page.getByRole("slider", { name: "Age", exact: true });
		await age.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		const min = Number(await age.getAttribute("aria-valuemin"));
		const max = Number(await age.getAttribute("aria-valuemax"));
		await age.focus();

		await page.keyboard.press("Home");
		await expect(age).toHaveAttribute("aria-valuenow", String(min));
		await page.keyboard.press("ArrowUp");
		await expect(age).toHaveAttribute("aria-valuenow", String(min + 1));
		await page.keyboard.press("ArrowRight");
		await expect(age).toHaveAttribute("aria-valuenow", String(min + 2));
		await page.keyboard.press("PageUp");
		await expect(age).toHaveAttribute("aria-valuenow", String(min + 12));
		await page.keyboard.press("ArrowDown");
		await expect(age).toHaveAttribute("aria-valuenow", String(min + 11));
		await page.keyboard.press("PageDown");
		await expect(age).toHaveAttribute("aria-valuenow", String(min + 1));
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("ArrowLeft");
		await expect(age).toHaveAttribute("aria-valuenow", String(min));
		await page.keyboard.press("End");
		await expect(age).toHaveAttribute("aria-valuenow", String(max));
		await page.keyboard.press("ArrowUp");
		await page.waitForTimeout(1_000);
		await expect(age).toHaveAttribute("aria-valuenow", String(max));
		await expect(age).toBeFocused();
	});
});

test.describe("the location picker", () => {
	test.use({ baseURL: DEV_SERVER_URL });

	const search = (page: Page) =>
		page.getByRole("combobox", { name: "Search places…" });
	const results = (page: Page) =>
		page.getByRole("listbox", { name: "Places" });
	const dialog = (page: Page) => page.getByRole("dialog");
	const tileSources = (page: Page) =>
		page
			.locator(".leaflet-tile")
			.evaluateAll((tiles) =>
				tiles.map((tile) => tile.getAttribute("src")),
			);

	async function openPicker({
		page,
		placesAnswer,
	}: {
		page: Page;
		placesAnswer: { status: number; body: unknown };
	}) {
		const places = await answerDemoRequests(page, {
			pathPrefix: "/v3/places/search?",
			...placesAnswer,
		});
		await installTauriShim(page, { platform: "macos" });
		await openGrid(page);
		await places.start();
		await page.getByRole("button", { name: "Change location" }).click();
		await search(page).waitFor({ timeout: 180_000 });
		await dialog(page)
			.getByRole("img", { name: "Selected location" })
			.waitFor({ timeout: 60_000 });
	}

	async function showResults(page: Page) {
		await search(page).fill("Paris");
		await expect(results(page).getByRole("option")).toHaveCount(
			PLACES.length,
		);
	}

	test.describe("when the search fails", () => {
		test("keeps the error open while Tab moves focus into it", async ({
			page,
		}) => {
			await openPicker({ page, placesAnswer: { status: 500, body: {} } });
			await search(page).fill("Paris");
			const copyError = dialog(page).getByRole("button", {
				name: "Copy error details",
			});
			await copyError.waitFor();

			await page.keyboard.press("Tab");
			await page.waitForTimeout(500);
			await expect(copyError).toBeVisible();
			await expect(copyError).toBeFocused();
		});
	});

	test.describe("with results", () => {
		test.beforeEach(async ({ page }) => {
			await openPicker({
				page,
				placesAnswer: {
					status: 200,
					body: {
						places: PLACES.map((place, index) => ({
							...place,
							importance: 1 - index / 10,
						})),
					},
				},
			});
		});

		test("shows the pin as an image outside the Tab order", async ({
			page,
		}) => {
			const pin = dialog(page).getByRole("img", {
				name: "Selected location",
			});
			await expect(pin).not.toHaveAttribute("tabindex");
			await expect(
				dialog(page).getByRole("button", { name: "Selected location" }),
			).toHaveCount(0);
		});

		test("walks the results with arrows while focus stays in the field, and Enter picks one", async ({
			page,
		}) => {
			await showResults(page);
			const options = results(page).getByRole("option");
			await expect(options.first()).toHaveCSS("outline-style", "none");
			await expect(search(page)).not.toHaveAttribute(
				"aria-activedescendant",
			);

			await page.keyboard.press("ArrowDown");
			await expect(options.first()).toHaveCSS("outline-style", "solid");
			await expect(search(page)).toHaveAttribute(
				"aria-activedescendant",
				(await options.first().getAttribute("id"))!,
			);
			await page.keyboard.press("ArrowDown");
			const second = options.nth(1);
			await expect(options.first()).toHaveCSS("outline-style", "none");
			await expect(second).toHaveAttribute("data-highlighted", "");
			await expect(search(page)).toHaveAttribute(
				"aria-activedescendant",
				(await second.getAttribute("id"))!,
			);
			await expect(second).toHaveCSS("outline-style", "solid");
			await expect(second).toHaveCSS("outline-width", "2px");
			await expect(second).toHaveCSS("outline-offset", "-2px");
			await expect(search(page)).toBeFocused();
			expect(await focusedProblems(page)).toEqual([]);

			const tilesBefore = await tileSources(page);
			await page.keyboard.press("Enter");
			await expect(results(page)).toHaveCount(0);
			await expect.poll(() => tileSources(page)).not.toEqual(tilesBefore);
			await expect(search(page)).toBeFocused();
			await expect(search(page)).toHaveValue("Paris");
			await expect(dialog(page)).toBeVisible();
		});

		test("Enter picks nothing until an arrow key shows a result", async ({
			page,
		}) => {
			await showResults(page);
			const tilesBefore = await tileSources(page);

			await page.keyboard.press("Enter");
			await page.waitForTimeout(1_000);
			await expect(results(page).getByRole("option")).toHaveCount(
				PLACES.length,
			);
			expect(await tileSources(page)).toEqual(tilesBefore);
		});

		test("typing again hides the arrow highlight", async ({ page }) => {
			await showResults(page);
			await page.keyboard.press("ArrowDown");
			await page.keyboard.press("ArrowDown");

			await page.keyboard.type(" ");
			await expect(search(page)).not.toHaveAttribute(
				"aria-activedescendant",
			);
			await expect(results(page).getByRole("option").nth(1)).toHaveCSS(
				"outline-style",
				"none",
			);
		});

		test("Home and End go to the text field instead of the results", async ({
			page,
		}) => {
			await showResults(page);
			const options = results(page).getByRole("option");
			await page.keyboard.press("ArrowDown");
			await expect(options.first()).toHaveAttribute(
				"data-highlighted",
				"",
			);
			const lastKeyWasPrevented = await watchLastKeydown(page);

			for (const key of ["End", "Home"]) {
				await page.keyboard.press(key);
				expect(await lastKeyWasPrevented()).toBe(false);
				await expect(options.first()).toHaveAttribute(
					"data-highlighted",
					"",
				);
				await expect(options.last()).not.toHaveAttribute(
					"data-highlighted",
				);
			}
			await expect(options).toHaveCount(PLACES.length);
		});

		test("Escape closes the results first and the picker second", async ({
			page,
		}) => {
			await showResults(page);

			await page.keyboard.press("Escape");
			await expect(results(page)).toHaveCount(0);
			await expect(dialog(page)).toBeVisible();
			await expect(search(page)).toBeFocused();

			await page.keyboard.press("Escape");
			await expect(dialog(page)).toHaveCount(0);
		});

		test("Tab leaves the field in one stop and closes the results", async ({
			page,
		}) => {
			await showResults(page);

			await page.keyboard.press("Tab");
			await expect(results(page)).toHaveCount(0);
			expect(await isFocused(search(page))).toBe(false);
			expect(await focusedProblems(page)).toEqual([]);
		});

		test("the results close when the field loses focus, as before", async ({
			page,
		}) => {
			await showResults(page);
			await search(page).blur();
			await expect(results(page)).toHaveCount(0);

			await showResults(page);
			const lastResult = (await results(page)
				.getByRole("option")
				.last()
				.boundingBox())!;
			await page.mouse.click(
				lastResult.x + lastResult.width / 2,
				lastResult.y + lastResult.height + 40,
			);
			await expect(results(page)).toHaveCount(0);
			await expect(dialog(page)).toBeVisible();
		});

		test("a clicked result closes the list and lets go of the field, as before", async ({
			page,
		}) => {
			await showResults(page);
			await results(page)
				.getByRole("option", { name: "Paris Texas" })
				.click();

			await expect(results(page)).toHaveCount(0);
			await expect(search(page)).not.toBeFocused();
			await expect(search(page)).toHaveValue("Paris");
		});

		test.describe("in the phone drawer", () => {
			test.use({ viewport: { width: 420, height: 800 } });

			test("Escape closes the results first and the drawer second", async ({
				page,
			}) => {
				await showResults(page);

				await page.keyboard.press("Escape");
				await expect(results(page)).toHaveCount(0);
				await expect(dialog(page)).toBeVisible();
				await expect(search(page)).toBeFocused();

				await page.keyboard.press("Escape");
				await expect(dialog(page)).toHaveCount(0);
			});
		});
	});
});

test.describe("the command center", () => {
	const palette = (page: Page) => page.getByRole("combobox");
	const selectedOption = (page: Page) =>
		page.getByRole("option", { selected: true });

	async function openPalette(page: Page) {
		await openGrid(page);
		await page.keyboard.press(await commandCenterShortcut(page));
		await palette(page).waitFor();
	}

	test("Home and End go to the text field instead of the selection", async ({
		page,
	}) => {
		await installTauriShim(page, { platform: "macos" });
		await openPalette(page);
		await palette(page).fill("/");
		await page.keyboard.press("ArrowDown");
		const selected = (await selectedOption(page).textContent())!;
		const lastKeyWasPrevented = await watchLastKeydown(page);

		for (const key of ["Home", "End"]) {
			await page.keyboard.press(key);
			expect(await lastKeyWasPrevented()).toBe(false);
			await expect(selectedOption(page)).toHaveText(selected);
		}
	});

	test("leaves Control+J to the text field on macOS", async ({ page }) => {
		await installTauriShim(page, { platform: "macos" });
		await openPalette(page);
		await palette(page).fill("/");
		const first = (await selectedOption(page).textContent())!;

		await page.keyboard.press("Control+j");
		await expect(selectedOption(page)).toHaveText(first);
	});

	test("moves the selection with Control+J on Windows", async ({ page }) => {
		await installTauriShim(page, { platform: "windows" });
		await openPalette(page);
		await palette(page).fill("/");
		const first = (await selectedOption(page).textContent())!;

		await page.keyboard.press("Control+j");
		await expect(selectedOption(page)).not.toHaveText(first);
	});
});

test.describe("the profile top bar", () => {
	test("Tab follows the visual order of the menu and favorite buttons", async ({
		page,
	}) => {
		await installTauriShim(page, { platform: "macos" });
		await page.goto("/profile/100001");
		const menu = page.getByRole("button", { name: "Profile menu" });
		await menu.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		const favorite = page.getByRole("switch", { name: / favorites$/ });
		const menuBox = (await menu.boundingBox())!;
		const favoriteBox = (await favorite.boundingBox())!;
		expect(menuBox.x).toBeLessThan(favoriteBox.x);

		await menu.focus();
		await page.keyboard.press("Tab");
		await expect(favorite).toBeFocused();
		expect(await focusedProblems(page)).toEqual([]);
	});
});
