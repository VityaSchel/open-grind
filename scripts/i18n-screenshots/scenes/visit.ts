import type { Locator, Page } from "@playwright/test";

import { releaseClock } from "../../store-screenshots/clock";

export async function visit({
	page,
	path,
	ready,
}: {
	page: Page;
	path: string;
	ready: Locator;
}): Promise<void> {
	await page.goto(path);
	await ready.first().waitFor();
	await releaseClock(page);
}
