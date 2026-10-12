import type { Page } from "@playwright/test";

const SHOWN_TOAST = '[data-sonner-toast][data-mounted="true"]';
const TOASTER = "ol[data-sonner-toaster]";

export async function holdToast(page: Page): Promise<void> {
	await page.locator(SHOWN_TOAST).first().waitFor();
	await page.locator(TOASTER).first().dispatchEvent("mouseenter");
}
