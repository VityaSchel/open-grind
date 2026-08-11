import { expect, type Page } from "@playwright/test";

// Not toHaveCount(0) — that retries, outliving the toast, and can never fail.
export async function expectNoToast(page: Page, text: string): Promise<void> {
	expect(await page.getByText(text).count(), `"${text}" toast`).toBe(0);
}
