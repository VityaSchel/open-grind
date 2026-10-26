import type { Locator, Page } from "@playwright/test";

import { TrustedTouch } from "../../../e2e/support/app";

export const SHOWN_TOAST = '[data-sonner-toast][data-mounted="true"]';
const LIVE_TOAST = `${SHOWN_TOAST}:not([data-removed="true"])`;
const TOASTER = "ol[data-sonner-toaster]";
const SWIPE_AWAY_PX = 120;

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

async function swipeToEdge({
	page,
	toast,
}: {
	page: Page;
	toast: Locator;
}): Promise<void> {
	const box = await toast.boundingBox();
	if (box === null) throw new Error("The toast to swipe away has no box");
	const towardEdge =
		(await toast.getAttribute("data-y-position")) === "top"
			? -SWIPE_AWAY_PX
			: SWIPE_AWAY_PX;
	const from = { x: box.x + box.width / 4, y: box.y + box.height / 2 };
	const touch = await TrustedTouch.attach(page);
	await touch.drag(
		page,
		from,
		{ x: from.x, y: from.y + towardEdge },
		{ steps: 1 },
	);
}

export async function swipeAwayToastIfShown({
	page,
	text,
}: {
	page: Page;
	text: string;
}): Promise<void> {
	const toast = page.locator(SHOWN_TOAST, { hasText: text });
	if ((await page.locator(LIVE_TOAST, { hasText: text }).count()) > 0) {
		await swipeToEdge({ page, toast });
	}
	await toast.waitFor({ state: "detached" });
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
