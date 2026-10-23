import { expect, type Locator, type Page } from "@playwright/test";

import { animationsFinished } from "./app";

const ERROR_TOAST_MODULE_URL = "/src/lib/api/error-toast.ts";
export const UPDATE_TOASTS_MODULE_URL = "/src/lib/updates/toasts.ts";

export const TOAST_GAP_PX = 8;
export const BOTTOM_TOASTER = '[data-sonner-toaster][data-y-position="bottom"]';

export type ToastEdge = "top" | "bottom";

export function bottomToaster(page: Page): Locator {
	return page.locator(BOTTOM_TOASTER);
}

export async function toastGap({
	toast,
	obstruction,
	edge,
}: {
	toast: Locator;
	obstruction: Locator;
	edge: ToastEdge;
}): Promise<number> {
	const toastBox = await toast.boundingBox();
	const obstructionBox = await obstruction.boundingBox();
	if (!toastBox || !obstructionBox) throw new Error("Nothing to measure");
	return edge === "top"
		? toastBox.y - (obstructionBox.y + obstructionBox.height)
		: obstructionBox.y - (toastBox.y + toastBox.height);
}

// Not toHaveCount(0) — that retries, outliving the toast, and can never fail.
export async function expectNoToast(page: Page, text: string): Promise<void> {
	expect(await page.getByText(text).count(), `"${text}" toast`).toBe(0);
}

function showToast({
	page,
	edge,
	label,
}: {
	page: Page;
	edge: ToastEdge;
	label: string;
}): Promise<void> {
	if (edge === "top")
		return page.evaluate(
			async ({ module, title }) => {
				const { showUpToDate } = await import(module);
				showUpToDate(title);
			},
			{ module: UPDATE_TOASTS_MODULE_URL, title: label },
		);
	return page.evaluate(
		async ({ module, title }) => {
			const { showErrorToast } = await import(module);
			showErrorToast({ label: title, error: new Error(title) });
		},
		{ module: ERROR_TOAST_MODULE_URL, title: label },
	);
}

export async function showRestingToast({
	page,
	edge,
	label,
}: {
	page: Page;
	edge: ToastEdge;
	label: string;
}): Promise<Locator> {
	await showToast({ page, edge, label });
	return await restingToast({ page, label });
}

export async function restingToast({
	page,
	label,
}: {
	page: Page;
	label: string;
}): Promise<Locator> {
	const toast = page.locator('[data-sonner-toast][data-front="true"]', {
		hasText: label,
	});
	await expect(toast).toHaveAttribute("data-mounted", "true");
	await animationsFinished(toast);
	return toast;
}
