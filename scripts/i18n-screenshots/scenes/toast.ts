import type { Page } from "@playwright/test";

export const SHOWN_TOAST = '[data-sonner-toast][data-mounted="true"]';
const TOASTER = "ol[data-sonner-toaster]";

export async function holdToast(page: Page): Promise<void> {
	await page.locator(SHOWN_TOAST).first().waitFor();
	await page.locator(TOASTER).first().dispatchEvent("mouseenter");
}

export async function pauseToasts(page: Page): Promise<void> {
	await page.locator(TOASTER).first().dispatchEvent("pointerdown");
}

export async function waitForNewToast({
	page,
	action,
}: {
	page: Page;
	action: () => Promise<void>;
}): Promise<void> {
	const shown = await page.locator(SHOWN_TOAST).count();
	await action();
	await page.locator(SHOWN_TOAST).nth(shown).waitFor();
}

export async function addingToast({
	page,
	action,
}: {
	page: Page;
	action: () => Promise<void>;
}): Promise<void> {
	await waitForNewToast({ page, action });
	await pauseToasts(page);
	await holdToast(page);
}

export async function toastsShown({
	page,
	count,
}: {
	page: Page;
	count: number;
}): Promise<void> {
	await page.locator(SHOWN_TOAST).first().waitFor();
	await pauseToasts(page);
	await page
		.locator(SHOWN_TOAST)
		.nth(count - 1)
		.waitFor();
	await holdToast(page);
}
