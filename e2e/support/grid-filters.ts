import type { Page } from "@playwright/test";

const DIALOG = '[role="dialog"]';
const TRANSPARENT = "rgba(0, 0, 0, 0)";

export const filtersScroller = (page: Page) =>
	page.locator(`${DIALOG} [data-slot="grid-filters-scroller"]`);

export async function openAllFilters(page: Page): Promise<void> {
	await page.locator('[aria-label="All filters"]').click();
	await page.locator(`${DIALOG}:focus-within`).waitFor();
}

export function scrollFiltersToBottom(page: Page): Promise<void> {
	return filtersScroller(page).evaluate((scroller) =>
		scroller.scrollTo({ top: scroller.scrollHeight }),
	);
}

export function dividers(
	page: Page,
): Promise<{ header: boolean; footer: boolean }> {
	return page.locator(DIALOG).evaluate(async (dialog, transparent) => {
		const header = dialog.querySelector('[data-slot="sheet-header"]');
		const footer = dialog.querySelector('[data-slot="sheet-footer"]');
		if (!header || !footer) throw new Error("The sheet lost its edges");
		await Promise.all(
			[header, footer].flatMap((edge) =>
				edge
					.getAnimations()
					.map(({ finished }) => finished.catch(() => undefined)),
			),
		);
		return {
			header: getComputedStyle(header).borderBottomColor !== transparent,
			footer: getComputedStyle(footer).borderTopColor !== transparent,
		};
	}, TRANSPARENT);
}
