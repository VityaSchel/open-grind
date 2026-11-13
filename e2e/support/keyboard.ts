import type { Page } from "@playwright/test";

import type { NativeInsets } from "../../src/lib/platform/native-insets";

export type Keyboard = {
	viewport: { width: number; height: number };
	insets: NativeInsets;
};

export const TEST_INSETS: NativeInsets = {
	top: 64,
	bottom: 64,
	left: 0,
	right: 0,
	ime: false,
};

export const IPHONE_PORTRAIT = { width: 402, height: 874 };
export const IPHONE_LANDSCAPE = { width: 874, height: 402 };
export const IPHONE_PORTRAIT_INSETS: NativeInsets = {
	top: 62,
	bottom: 34,
	left: 0,
	right: 0,
	ime: false,
};
export const IPHONE_LANDSCAPE_INSETS: NativeInsets = {
	top: 0,
	bottom: 20,
	left: 62,
	right: 62,
	ime: false,
};

export function sendInsets(page: Page, insets: NativeInsets): Promise<unknown> {
	return page.evaluate((next) => window.__reapplyInsets(next), insets);
}

export function sendIosInsets(
	page: Page,
	insets: NativeInsets,
): Promise<unknown> {
	return page.evaluate((next) => {
		window.__iosInsets = next;
		return window.__reapplyInsets(window.__iosInsets);
	}, insets);
}

export async function switchKeyboardAtOnce(
	page: Page,
	{
		viewport,
		insets,
		send = sendInsets,
	}: Keyboard & { send?: typeof sendInsets },
): Promise<void> {
	await send(page, insets);
	await page.setViewportSize(viewport);
}
