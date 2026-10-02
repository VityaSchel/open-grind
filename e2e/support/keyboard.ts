import type { Page } from "@playwright/test";

export type Keyboard = {
	viewport: { width: number; height: number };
	insets: {
		top: number;
		bottom: number;
		left: number;
		right: number;
		ime: boolean;
	};
};

export function sendInsets(
	page: Page,
	insets: Keyboard["insets"],
): Promise<unknown> {
	return page.evaluate((next) => window.__reapplyInsets(next), insets);
}

export async function switchKeyboardAtOnce(
	page: Page,
	{ viewport, insets }: Keyboard,
): Promise<void> {
	await sendInsets(page, insets);
	await page.setViewportSize(viewport);
}
