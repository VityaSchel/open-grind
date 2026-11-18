import { expect, type Locator, type Page, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";
import {
	installPersistentAppData,
	storedPreferences,
} from "./support/app-data";
import { arrowThrough, focusProblems } from "./support/focus";
import { APP_SETTINGS } from "./support/page-stack";

test.describe.configure({ timeout: 180_000 });

const DISGUISE_PRESETS = [
	{ id: "calculator", name: "Calculator" },
	{ id: "weather", name: "Weather" },
	{ id: "notes", name: "Notes" },
	{ id: "papizza", name: "Papizza" },
];

function isFocused(target: Locator): Promise<boolean> {
	return target.evaluate((node) => node === document.activeElement);
}

function focusInside(container: Locator): Promise<boolean> {
	return container.evaluate((node) => node.contains(document.activeElement));
}

async function expectOneTabStop({
	page,
	composite,
	stop,
}: {
	page: Page;
	composite: Locator;
	stop: Locator;
}): Promise<void> {
	await stop.focus();
	await page.keyboard.press("Tab");
	expect(await focusInside(composite)).toBe(false);
	await page.keyboard.press("Shift+Tab");
	expect(await isFocused(stop)).toBe(true);
	await page.keyboard.press("Shift+Tab");
	expect(await focusInside(composite)).toBe(false);
}

async function offerDisguises(page: Page): Promise<void> {
	await page.addInitScript((presets) => {
		const internals = (
			window as unknown as {
				__TAURI_INTERNALS__: {
					invoke: (cmd: string, args?: unknown) => Promise<unknown>;
				};
			}
		).__TAURI_INTERNALS__;
		const shimmed = internals.invoke;
		internals.invoke = (cmd, args) =>
			cmd === "disguise_state"
				? Promise.resolve({
						available: true,
						current: "original",
						presets,
						renameNeedsAdmin: false,
					})
				: shimmed(cmd, args);
	}, DISGUISE_PRESETS);
}

test.describe("Language", () => {
	const languages = (page: Page) =>
		page.getByRole("listbox", { name: "Language" });

	test.beforeEach(async ({ page }) => {
		await installTauriShim(page, { platform: "macos" });
		await page.goto(`${APP_SETTINGS}/language`);
		await languages(page)
			.getByRole("option", { selected: true })
			.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	});

	test("the language list is one Tab stop that rests on the chosen language", async ({
		page,
	}) => {
		const chosen = languages(page).getByRole("option", { selected: true });

		await expect(chosen).toHaveAttribute("tabindex", "0");
		await expect(languages(page).locator('[tabindex="0"]')).toHaveCount(1);
		await expectOneTabStop({
			page,
			composite: languages(page),
			stop: chosen,
		});
	});

	test("the arrow keys walk every language with a visible focus ring and wrap without switching", async ({
		page,
	}) => {
		const count = await languages(page).getByRole("option").count();
		const chosen = languages(page).getByRole("option", { selected: true });
		const chosenName = await chosen.textContent();
		const lang = await page.locator("html").getAttribute("lang");

		const walk = await arrowThrough(page, {
			start: chosen,
			key: "ArrowDown",
			stops: count + 1,
		});

		expect(walk).toHaveLength(count);
		expect(focusProblems(walk)).toEqual([]);
		expect(await isFocused(chosen)).toBe(true);
		expect(await chosen.textContent()).toBe(chosenName);
		await expect(page.locator("html")).toHaveAttribute("lang", lang!);
	});

	test("typing a name moves to it and Enter switches to it", async ({
		page,
	}) => {
		const german = languages(page).getByRole("option", {
			name: "German Deutsch",
		});
		await languages(page).getByRole("option", { selected: true }).focus();

		await page.keyboard.type("ger");
		await expect(german).toBeFocused();
		await expect(german).toHaveAttribute("aria-selected", "false");

		await page.keyboard.press("Enter");

		await expect(page.locator("html")).toHaveAttribute("lang", "de");
		await expect(german).toHaveAttribute("aria-selected", "true");
		await expect(german).toBeFocused();
	});
});

test.describe("Units", () => {
	const units = (page: Page) =>
		page.getByRole("radiogroup", { name: "Units" });

	test.beforeEach(async ({ page }) => {
		await installTauriShim(page, { platform: "macos" });
		await installPersistentAppData(page);
		await page.goto(`${APP_SETTINGS}/display`);
		await units(page)
			.getByRole("radio", { name: "Metric" })
			.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	});

	test("the arrow keys choose the units as they move, and Enter keeps the chosen one", async ({
		page,
	}) => {
		const metric = units(page).getByRole("radio", { name: "Metric" });
		const imperial = units(page).getByRole("radio", { name: "Imperial" });
		await expectOneTabStop({ page, composite: units(page), stop: metric });

		await metric.focus();
		await page.keyboard.press("ArrowRight");

		await expect(imperial).toBeFocused();
		await expect(imperial).toHaveAttribute("aria-checked", "true");
		await expect
			.poll(async () => (await storedPreferences(page))?.units)
			.toBe("imperial");

		await page.keyboard.press("Enter");
		await page.keyboard.press(" ");

		await expect(imperial).toHaveAttribute("aria-checked", "true");
		await expect
			.poll(async () => (await storedPreferences(page))?.units)
			.toBe("imperial");

		const walk = await arrowThrough(page, {
			start: imperial,
			key: "ArrowRight",
			stops: 3,
		});
		expect(walk).toHaveLength(2);
		expect(focusProblems(walk)).toEqual([]);
	});
});

test.describe("Discreet app icon", () => {
	test.use({ viewport: { width: 420, height: 800 } });

	const icons = (page: Page) =>
		page.locator('[data-slot="disguise-choices"]');
	const icon = (page: Page, name: string) =>
		icons(page).getByRole("button", { name, exact: true });

	test.beforeEach(async ({ page }) => {
		await installTauriShim(page, { platform: "macos" });
		await offerDisguises(page);
		await page.goto(`${APP_SETTINGS}/discreet-icon`);
		await icon(page, "Papizza").waitFor({
			timeout: FIRST_ROUTE_COMPILE_MS,
		});
	});

	test("the icons are one Tab stop that rests on the current icon", async ({
		page,
	}) => {
		const current = icon(page, "Open Grind");

		await expect(current).toHaveAttribute("aria-pressed", "true");
		await expect(current).toHaveAttribute("tabindex", "0");
		await expect(icons(page).locator('[tabindex="0"]')).toHaveCount(1);
		await expectOneTabStop({ page, composite: icons(page), stop: current });
	});

	test("the arrow keys walk the icons as a grid with the original alone on the top row", async ({
		page,
	}) => {
		const walk = await arrowThrough(page, {
			start: icon(page, "Open Grind"),
			key: "ArrowRight",
			stops: DISGUISE_PRESETS.length + 2,
		});
		expect(walk).toHaveLength(DISGUISE_PRESETS.length + 1);
		expect(focusProblems(walk)).toEqual([]);

		await icon(page, "Open Grind").focus();
		await page.keyboard.press("ArrowDown");
		await expect(icon(page, "Calculator")).toBeFocused();
		await page.keyboard.press("ArrowDown");
		await expect(icon(page, "Papizza")).toBeFocused();
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("ArrowUp");
		await expect(icon(page, "Open Grind")).toBeFocused();
		await page.keyboard.press("End");
		await expect(icon(page, "Open Grind")).toBeFocused();
	});
});

test.describe("profile field chips", () => {
	const field = "Pronouns";
	const chips = (page: Page) =>
		page.getByRole("toolbar", { name: field, exact: true });
	const search = (page: Page) =>
		page.getByRole("combobox", { name: field, exact: true });

	async function chooseUntil({
		page,
		count,
	}: {
		page: Page;
		count: number;
	}): Promise<void> {
		const removals = chips(page).getByRole("button");
		while ((await removals.count()) < count) {
			await search(page).click();
			await page
				.getByRole("option", { disabled: false, selected: false })
				.first()
				.click();
			await page.keyboard.press("Escape");
			await expect(search(page)).toHaveValue("");
		}
	}

	test.beforeEach(async ({ page }) => {
		await installTauriShim(page, { platform: "macos" });
		await page.goto("/settings/profile");
		await search(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await chooseUntil({ page, count: 3 });
	});

	test("Backspace in the empty search reaches the chips, which are one Tab stop walked by the arrow keys", async ({
		page,
	}) => {
		const removals = chips(page).getByRole("button");
		const count = await removals.count();
		await search(page).focus();

		await page.keyboard.press("Backspace");

		await expect(removals.last()).toBeFocused();
		await expect(chips(page).locator('[tabindex="0"]')).toHaveCount(1);
		const walk = await arrowThrough(page, {
			key: "ArrowLeft",
			stops: count + 1,
		});
		expect(walk).toHaveLength(count);
		expect(focusProblems(walk)).toEqual([]);

		await page.keyboard.press("Tab");
		await expect(search(page)).toBeFocused();
		await page.keyboard.press("Shift+Tab");
		await expect(removals.last()).toBeFocused();
	});

	test("Delete removes the focused chip, says so, and moves to the next chip, then the previous one, then the search", async ({
		page,
	}) => {
		const removals = chips(page).getByRole("button");
		const count = await removals.count();
		const firstName = await removals.first().getAttribute("aria-label");
		const secondName = await removals.nth(1).getAttribute("aria-label");
		await removals.first().focus();

		await page.keyboard.press("Delete");

		await expect(removals).toHaveCount(count - 1);
		await expect(
			chips(page).getByRole("button", { name: secondName! }),
		).toBeFocused();
		await expect(
			page.getByRole("status").filter({ hasText: /^Removed / }),
		).toHaveText(firstName!.replace(/^Remove /, "Removed "));

		await removals.last().focus();
		await page.keyboard.press("Backspace");
		await expect(removals).toHaveCount(count - 2);
		await expect(removals.last()).toBeFocused();

		for (let left = count - 2; left > 0; left -= 1)
			await page.keyboard.press("Enter");

		await expect(removals).toHaveCount(0);
		await expect(search(page)).toBeFocused();
	});
});
