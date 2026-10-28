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

export const TEST_INSETS: Keyboard["insets"] = {
	top: 64,
	bottom: 64,
	left: 0,
	right: 0,
	ime: false,
};

export function sendInsets(
	page: Page,
	insets: Keyboard["insets"],
): Promise<unknown> {
	return page.evaluate((next) => window.__reapplyInsets(next), insets);
}

export function sendIosInsets(
	page: Page,
	insets: Keyboard["insets"],
): Promise<unknown> {
	return page.evaluate((next) => {
		window.__iosInsets = next;
		return window.__reapplyInsets(window.__iosInsets);
	}, insets);
}

export async function switchKeyboardAtOnce(
	page: Page,
	{ viewport, insets }: Keyboard,
): Promise<void> {
	await sendInsets(page, insets);
	await page.setViewportSize(viewport);
}
