import { expect, type Page, test } from "@playwright/test";

import {
	animationsFinished,
	captureOpenedUrls,
	installEventInjection,
	installTauriShim,
	openGrid,
} from "./support/app";
import { routeDemoThroughFaultHook } from "./support/demo-faults";

const TRANSPORT_MODULE_URL = "/src/lib/api/transport.ts";
const UPDATE_TOASTS_MODULE_URL = "/src/lib/updates/toasts.ts";

type CascadeFault = { answering: boolean; hits: number };
type FaultyWindow = Window & { __cascadeFault: CascadeFault };

async function answerCascadeWith(
	page: Page,
	answer: { status: number; body: unknown },
) {
	await page.addInitScript((response) => {
		const fault: CascadeFault = { answering: false, hits: 0 };
		Object.assign(window, {
			__cascadeFault: fault,
			__demoFault: ({ path }: { path: string }) => {
				if (!fault.answering || !path.startsWith("/v4/cascade"))
					return undefined;
				fault.hits += 1;
				return response;
			},
		});
	}, answer);
	await routeDemoThroughFaultHook(page);
	return {
		start: () =>
			page.evaluate(() => {
				(window as unknown as FaultyWindow).__cascadeFault.answering =
					true;
			}),
		hits: () =>
			page.evaluate(
				() => (window as unknown as FaultyWindow).__cascadeFault.hits,
			),
	};
}

function emit(page: Page, event: string, payload: unknown) {
	return page.evaluate(
		([name, data]) => window.__emitTauriEvent?.(name, data),
		[event, payload] as const,
	);
}

test("Grindr asking for phone verification opens the popup once", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await installTauriShim(page);
	const cascade = await answerCascadeWith(page, {
		status: 403,
		body: {
			code: 30,
			message: "Verification required",
			profileId: "123456000",
		},
	});
	await openGrid(page);
	const onlineFilter = page.getByRole("button", {
		name: "Online",
		exact: true,
	});

	await cascade.start();
	await onlineFilter.click();

	const dialog = page.getByRole("alertdialog");
	await expect(
		dialog.getByRole("heading", { name: "Phone verification required" }),
	).toBeVisible();
	await dialog.getByRole("button", { name: "OK" }).click();
	await expect(dialog).toBeHidden();

	const answered = await cascade.hits();
	await onlineFilter.click();
	await expect
		.poll(cascade.hits, { message: "the grid asks again" })
		.toBeGreaterThan(answered);
	expect(
		await page.getByRole("alertdialog").count(),
		"a dismissed verification popup stays closed",
	).toBe(0);
});

test("a timed ban says when it ends and links the appeal", async ({ page }) => {
	test.setTimeout(120_000);
	await installTauriShim(page);
	await installEventInjection(page);
	await openGrid(page);
	const openedUrls = await captureOpenedUrls(page);

	await emit(page, "auth:restriction", {
		kind: "timedBan",
		reason: "Drug Selling",
		subReason: "DRUG_SALES",
		endsAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
	});

	const dialog = page.getByRole("alertdialog");
	await expect(dialog).toContainText(
		"Grindr suspended this account (Drug sale and distribution) until",
	);
	await dialog.getByRole("link", { name: "Appeal" }).click();
	await expect
		.poll(openedUrls)
		.toEqual(["https://web.grindr.com/ban-appeal"]);

	await page.keyboard.press("Escape");
	await expect(dialog, "a suspension can't be dismissed").toBeVisible();
});

test("a blocked network asks to switch networks", async ({ page }) => {
	test.setTimeout(120_000);
	await installTauriShim(page);
	await installEventInjection(page);
	await openGrid(page);

	await emit(page, "auth:banned", {
		kind: "network",
		code: 31,
		message: "IP is banned",
	});

	const dialog = page.getByRole("alertdialog");
	await expect(
		dialog.getByRole("heading", { name: "Network blocked" }),
	).toBeVisible();
	await expect(dialog).toContainText(
		"This network was blocked by Grindr. Switch it or turn off your VPN, then sign in again.",
	);
	await dialog.getByRole("button", { name: "OK" }).click();

	await expect(dialog).toBeHidden();
});

test("Grindr refusing the app version asks once to update, and the update toast works over it", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await installTauriShim(page);
	const cascade = await answerCascadeWith(page, {
		status: 412,
		body: { code: 8, message: "The client version is deprecated" },
	});
	await openGrid(page);
	const openedUrls = await captureOpenedUrls(page);
	const onlineFilter = page.getByRole("button", {
		name: "Online",
		exact: true,
	});

	await cascade.start();
	await onlineFilter.click();

	const dialog = page.getByRole("alertdialog");
	await expect(
		dialog.getByRole("heading", { name: "Update Open Grind" }),
	).toBeVisible();
	await page.evaluate(async (module) => {
		const { fetchRest } = await import(module);
		await Promise.all(
			[1, 2, 3].map((page) =>
				fetchRest(`/v4/cascade?pageNumber=${page}`),
			),
		);
	}, TRANSPORT_MODULE_URL);
	expect(await cascade.hits()).toBeGreaterThanOrEqual(4);
	expect(
		await page.getByRole("alertdialog").count(),
		"more refusals don't stack popups",
	).toBe(1);

	await dialog.getByRole("link", { name: "Check for updates" }).click();
	await expect
		.poll(openedUrls)
		.toEqual(["https://opengrind.org/guides/download"]);

	let activations = 0;
	await page.exposeFunction("recordActivation", () => (activations += 1));
	await page.evaluate(async (module) => {
		const { showStage } = await import(module);
		const record = (window as unknown as { recordActivation: () => void })
			.recordActivation;
		showStage({
			view: { stage: "available", received: 0, total: 0 },
			kind: "update",
			onActivate: record,
			onCancel: () => {},
			onDismiss: () => {},
		});
	}, UPDATE_TOASTS_MODULE_URL);
	const updateToast = page.locator('[data-sonner-toast][data-front="true"]', {
		hasText: "New update available",
	});
	await expect(updateToast).toHaveAttribute("data-mounted", "true");
	await animationsFinished(updateToast);
	await updateToast.tap();
	await expect.poll(() => activations).toBe(1);
	await expect(
		dialog,
		"the update toast doesn't close the popup",
	).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	const answered = await cascade.hits();
	await onlineFilter.click();
	await expect
		.poll(cascade.hits, { message: "the grid asks again" })
		.toBeGreaterThan(answered);
	expect(
		await page.getByRole("alertdialog").count(),
		"a dismissed update popup stays closed",
	).toBe(0);
});
