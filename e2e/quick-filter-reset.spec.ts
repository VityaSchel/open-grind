import { expect, type Page, test } from "@playwright/test";

import {
	ensureGridLocation,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./support/app";

const CONVERSATION_LINK = 'a[href^="/chat/1"]';

interface QuickFilter {
	pill: string;
	title: string;
	switchLabel: string;
}

async function openGrid(page: Page): Promise<void> {
	await installTauriShim(page);
	await page.goto("/");
	await page
		.locator("nav a")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await ensureGridLocation(page);
}

async function openInbox(page: Page): Promise<void> {
	await installTauriShim(page);
	await page.goto("/chat");
	await page
		.locator(CONVERSATION_LINK)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

const AGE: QuickFilter = {
	pill: "Age",
	title: "Age",
	switchLabel: "Filter by age",
};
const DISTANCE: QuickFilter = {
	pill: "Distance",
	title: "Distance",
	switchLabel: "Filter by distance",
};
const POSITION: QuickFilter = {
	pill: "Position",
	title: "Positions",
	switchLabel: "Filter by position",
};

const SCREENS = [
	{ name: "grid", open: openGrid, quickFilters: [AGE, POSITION] },
	{ name: "inbox", open: openInbox, quickFilters: [DISTANCE, POSITION] },
];

async function resetUntouchedFilter({
	page,
	quickFilter: { pill, title, switchLabel },
}: {
	page: Page;
	quickFilter: QuickFilter;
}): Promise<void> {
	const drawer = page.getByRole("dialog", { name: title });
	const filterSwitch = drawer.getByRole("switch", { name: switchLabel });
	const reset = drawer.getByRole("button", { name: "Reset", exact: true });

	await page.getByRole("button", { name: pill, exact: true }).click();

	await expect(filterSwitch).toHaveAttribute("aria-checked", "false");
	await expect(reset).toBeVisible();
	await expect(reset).toBeEnabled();

	await reset.click();

	await expect(filterSwitch).toHaveAttribute("aria-checked", "false");

	await drawer.getByRole("button", { name: "Apply" }).click();
	await expect(drawer).toBeHidden();
}

for (const { name, open, quickFilters } of SCREENS) {
	test(`Reset stays visible and usable in the ${name} quick filters while they hold their defaults`, async ({
		page,
	}) => {
		test.setTimeout(180_000);
		await open(page);

		for (const quickFilter of quickFilters) {
			await resetUntouchedFilter({ page, quickFilter });
		}
	});
}
