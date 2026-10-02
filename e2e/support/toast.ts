import { expect, type Locator, type Page } from "@playwright/test";

import { animationsFinished } from "./app";

const ERROR_TOAST_MODULE_URL = "/src/lib/api/error-toast.ts";
const UPDATE_TOASTS_MODULE_URL = "/src/lib/updates/toasts.ts";

export type ToastEdge = "top" | "bottom";

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
	const toast = page.locator('[data-sonner-toast][data-front="true"]', {
		hasText: label,
	});
	await expect(toast).toHaveAttribute("data-mounted", "true");
	await animationsFinished(toast);
	return toast;
}
