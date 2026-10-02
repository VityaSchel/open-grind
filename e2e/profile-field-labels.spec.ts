import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const TEXT_FIELDS = [
	"Display name",
	"About me",
	"Height",
	"Weight",
	"Last tested",
	"Instagram",
	"X",
	"Facebook",
];
const DROPDOWNS = [
	"Position",
	"Body type",
	"Ethnicity",
	"Relationship status",
	"My tribes",
	"Tribes I'm into",
	"Looking for",
	"Meet at",
	"Accept NSFW pics",
	"HIV status",
	"Sexual health practices",
	"Vaccines",
];
const COMBOBOXES = ["Tags", "Gender", "Pronouns"];
const SECTIONS = [
	"Photos",
	"Basics",
	"About",
	"Stats",
	"Expectations",
	"Health",
	"Socials",
];
const POSITION_SPECTRUM = [
	"Top",
	"Vers Top",
	"Versatile",
	"Vers Bottom",
	"Bottom",
	"Side",
];

const fieldLabel = (page: Page, name: string) =>
	page
		.locator('[data-slot="label"]')
		.filter({ hasText: new RegExp(`^${name}$`) });
const dropdown = (page: Page, name: string) =>
	page.getByRole("button", { name: new RegExp(`^${name} `) });
const combobox = (page: Page, name: string) =>
	page.getByRole("combobox", { name, exact: true });

async function nextFrame(page: Page): Promise<void> {
	await page.evaluate(
		() => new Promise((framed) => requestAnimationFrame(framed)),
	);
}

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/settings/profile");
	await fieldLabel(page, "Display name").waitFor({ timeout: 60_000 });
});

test("tapping a text field's label focuses the field", async ({ page }) => {
	for (const name of TEXT_FIELDS) {
		await fieldLabel(page, name).click();
		await expect(page.getByLabel(name, { exact: true })).toBeFocused();
	}
});

test("every picker takes its name from its label", async ({ page }) => {
	for (const name of DROPDOWNS)
		await expect(dropdown(page, name)).toBeVisible();
	for (const name of COMBOBOXES)
		await expect(combobox(page, name)).toBeVisible();
	await expect(page.getByRole("slider", { name: "Age" })).toBeVisible();

	await combobox(page, "Tags").click();
	await expect(page.getByRole("listbox", { name: "Tags" })).toBeVisible();
});

test("tapping a picker's label leaves the picker closed", async ({ page }) => {
	for (const [name, picker] of [
		["Position", dropdown(page, "Position")],
		["Tags", combobox(page, "Tags")],
	] as const) {
		await fieldLabel(page, name).click();
		await nextFrame(page);
		expect(await picker.getAttribute("aria-expanded")).toBe("false");

		await picker.click();
		await expect(picker).toHaveAttribute("aria-expanded", "true");
		await page.keyboard.press("Escape");
		await expect(picker).toHaveAttribute("aria-expanded", "false");
	}
});

test("the sections follow the order of the profile they describe", async ({
	page,
}) => {
	await expect(page.locator("form").getByRole("heading")).toHaveText(
		SECTIONS,
	);
});

test("each visibility switch is grouped right below the field it hides", async ({
	page,
}) => {
	for (const [field, visibility] of [
		[page.getByRole("slider", { name: "Age" }), "Show my age"],
		[dropdown(page, "Position"), "Show my position"],
		[dropdown(page, "My tribes"), "Show my tribes"],
	] as const) {
		const visibilitySwitch = page.getByRole("switch", { name: visibility });
		const pair = page
			.locator('[data-slot="field-pair"]')
			.filter({ has: visibilitySwitch });
		await expect(pair).toHaveCount(1);
		await expect(pair.getByRole("switch")).toHaveCount(1);
		await expect(pair.locator(field)).toBeVisible();

		const fieldBox = await field.boundingBox();
		const switchBox = await visibilitySwitch.boundingBox();
		expect(switchBox!.y).toBeGreaterThanOrEqual(
			fieldBox!.y + fieldBox!.height,
		);
	}
});

test("the position menu runs from top to side with an icon per position", async ({
	page,
}) => {
	const position = dropdown(page, "Position");
	await position.click();

	const items = page.getByRole("menuitemradio");
	await expect(items).toHaveText(["Not set", ...POSITION_SPECTRUM]);
	for (const name of POSITION_SPECTRUM) {
		await expect(
			page
				.getByRole("menuitemradio", { name, exact: true })
				.locator('[data-slot="select-field-icon"]'),
		).toHaveCount(1);
	}

	await page
		.getByRole("menuitemradio", { name: "Vers Top", exact: true })
		.click();
	await expect(position).toHaveAccessibleName("Position Vers Top");
	await expect(
		position.locator('[data-slot="select-field-icon"]'),
	).toHaveCount(1);
});
